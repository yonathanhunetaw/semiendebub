import { expect, test, type Page } from '@playwright/test';
import { addFirstVariant, confirmPayment, deliveryMethod, openCheckout, payInCash, placeOrder, startCart } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Cash a seller took sits on their balance until they hand it over to a settlement account and
 * the account's owner confirms receiving it. A handover the owner has not confirmed does not
 * leave the balance, it only stops that much being handed over twice.
 */
const reference = `E2E-HO-${Date.now().toString().slice(-6)}`;

/** The cash the seller holds, as the Balance page's "Taken by you" bucket shows it. */
async function cashHeld(seller: Page): Promise<number> {
    await seller.goto(app('seller', '/balance'));
    // Count only once the page has rendered: an empty page would read as no cash held.
    await expect(seller.locator('main')).toContainText(/ETB/);
    const bucket = seller.locator('section').filter({ hasText: 'Taken by you' }).first();
    if ((await bucket.count()) === 0) return 0;
    const text = (await bucket.innerText()).match(/ETB\s*([\d,]+\.\d{2})/);

    return text ? Number(text[1].replace(/,/g, '')) : 0;
}

test("the seller hands 1 ETB of cash over; it leaves their balance once the owner confirms it", async ({ browser }) => {
    // Seller Two, so other specs' cash does not move the figures.
    const seller = await signIn(browser, 'seller', fixture.people.seller2.email);
    const manager = await signIn(browser, 'seller', fixture.manager.email);

    await test.step('a confirmed cash sale puts cash on the seller\'s balance', async () => {
        const before = await cashHeld(seller);
        const cartId = await startCart(seller, null);
        await addFirstVariant(seller, cartId, fixture.items[0].item_id);
        await openCheckout(seller, cartId);
        await payInCash(seller);
        await deliveryMethod(seller, 'Add later').click();
        const order = await placeOrder(seller, 'Place order & request confirmation');
        await confirmPayment(manager, order);
        expect(await cashHeld(seller)).toBeGreaterThan(before);
    });

    const held = await cashHeld(seller);

    await test.step('the seller sends a 1 ETB handover to the settlement account', async () => {
        const bucket = seller.locator('section').filter({ hasText: 'Taken by you' }).first();
        await bucket.getByRole('button', { name: 'Hand over' }).click();
        const account = (await bucket.locator('option').filter({ hasText: fixture.settlement.number }).first().innerText()).trim();
        await bucket.locator('select').selectOption({ label: account });
        await bucket.locator('input[type="number"]').fill('1');
        await bucket.getByPlaceholder('Transfer no.').fill(reference);
        await bucket.getByRole('button', { name: 'Send handover' }).click();
        await expect(seller.getByText(/will check the account and confirm the handover/)).toBeVisible();
        // Not confirmed yet: still on the balance.
        expect(await cashHeld(seller)).toBeCloseTo(held, 2);
    });

    await test.step('the owner confirms receiving it: 1 ETB off the seller\'s balance', async () => {
        await manager.goto(app('seller', '/payments/inbox'));
        const card = manager.locator('div.rounded-\\[16px\\]').filter({ hasText: reference });
        await card.getByRole('button', { name: 'Confirm received' }).click();
        await manager.getByRole('dialog').getByRole('button', { name: 'Yes, confirm' }).click();
        await expect(card).toHaveCount(0);
        expect(await cashHeld(seller)).toBeCloseTo(held - 1, 2);
    });
});
