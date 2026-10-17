import { expect, test, type Page } from '@playwright/test';
import { addFirstVariant, confirmPayment, deliveryMethod, openCheckout, payInCash, pickAndPack, placeOrder, run, startCart } from '../lib/flows';
import { app, fixture, signIn, closeWindows } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * End of the day, on the dev database (make walkthrough): the cash a seller took sits on their
 * balance until they hand it over to the settlement account (DEMO-SET-01) and its owner, Demo
 * Manager, confirms receiving it. Unconfirmed, it does not leave the balance.
 */
const transferNo = `DEMO-HO-${run.slice(-6)}`;

/** The cash the seller holds, as the Balance page's "Taken by you" bucket shows it. */
async function cashHeld(seller: Page): Promise<number> {
    await seller.goto(app('seller', '/balance'));
    await expect(seller.locator('main')).toContainText(/ETB/);
    const bucket = seller.locator('section').filter({ hasText: 'Taken by you' }).first();
    if ((await bucket.count()) === 0) return 0;
    const text = (await bucket.innerText()).match(/ETB\s*([\d,]+\.\d{2})/);

    return text ? Number(text[1].replace(/,/g, '')) : 0;
}

test("cash hand-over: the seller hands their cash to the settlement account; it leaves their balance once confirmed", async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const manager = await signIn(browser, 'seller', fixture.manager.email);

    await test.step('1. a cash sale: confirmed cash lands on the seller\'s balance', async () => {
        const before = await cashHeld(seller);
        const cartId = await startCart(seller, null);
        await addFirstVariant(seller, cartId, fixture.items[0].item_id);
        await openCheckout(seller, cartId);
        await payInCash(seller);
        await deliveryMethod(seller, 'In store').click();
        const order = await placeOrder(seller, 'Place order & request confirmation');
        await confirmPayment(manager, order);
        await pickAndPack(seller, order, 'customer');
        expect(await cashHeld(seller)).toBeGreaterThan(before);
    });

    const held = await cashHeld(seller);

    await test.step(`2. the seller hands all ${held.toFixed(2)} ETB over to ${fixture.settlement.number}`, async () => {
        const bucket = seller.locator('section').filter({ hasText: 'Taken by you' }).first();
        await bucket.getByRole('button', { name: 'Hand over' }).click();
        const account = (await bucket.locator('option').filter({ hasText: fixture.settlement.number }).first().innerText()).trim();
        await bucket.locator('select').selectOption({ label: account });
        await bucket.locator('input[type="number"]').fill(held.toFixed(2));
        await bucket.getByPlaceholder('Transfer no.').fill(transferNo);
        await bucket.getByRole('button', { name: 'Send handover' }).click();
        await expect(seller.getByText(/will check the account and confirm the handover/)).toBeVisible();
        expect(await cashHeld(seller), 'not confirmed yet: still on the balance').toBeCloseTo(held, 2);
    });

    await test.step('3. Demo Manager confirms receiving it: the seller holds no cash', async () => {
        await manager.goto(app('seller', '/payments/inbox'));
        const card = manager.locator('div.rounded-\\[16px\\]').filter({ hasText: transferNo });
        await card.getByRole('button', { name: 'Confirm received' }).click();
        await manager.getByRole('dialog').getByRole('button', { name: 'Yes, confirm' }).click();
        await expect(card).toHaveCount(0);
        expect(await cashHeld(seller)).toBeCloseTo(0, 2);
    });

    console.log(`
  Walkthrough done: ${fixture.seller.name} handed ${held.toFixed(2)} ETB over to ${fixture.settlement.number} (transfer no. ${transferNo}), confirmed by ${fixture.manager.name}.
  Where to look (password in e2e/.fixture/demo.json):
    Seller   ${fixture.seller.email}    ${app('seller', '/balance')}   Taken by you: 0
    Manager  ${fixture.manager.email}    ${app('seller', '/payments/inbox')}
    Admin    ${fixture.people.admin.email}    ${app('admin', '/payment-accounts')}   the settlement account
`);
});
