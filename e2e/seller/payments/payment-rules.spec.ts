import { expect, test, type Page } from '@playwright/test';
import { addFirstVariant, confirmPayment, deliveryMethod, expectInManagerInbox, openCheckout, payInCash, placeOrder, startCart } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Two people for every payment part (PaymentService::mayConfirm): whoever took the money never
 * confirms it. Cash is confirmed by the store's manager or an admin of the store; a seller,
 * whoever they are, never confirms anything.
 */

/** A walk-in cash order placed by whoever is signed in on `page`. */
async function cashOrder(page: Page): Promise<string> {
    const cartId = await startCart(page, null);
    await addFirstVariant(page, cartId, fixture.items[0].item_id);
    await openCheckout(page, cartId);
    await deliveryMethod(page, 'Add later').click();
    await payInCash(page);

    return placeOrder(page, 'Place order & request confirmation');
}

/** The order shows nowhere in this person's inbox with a Confirm button. */
async function cannotConfirm(page: Page, reference: string): Promise<void> {
    await page.goto(app('seller', '/payments/inbox'));
    await expect(page.getByRole('heading').first()).toBeVisible();
    await expect(page.locator('div.rounded-\\[16px\\]').filter({ hasText: reference }).getByRole('button', { name: 'Confirm received' })).toHaveCount(0);
}

test("a seller's cash: neither that seller nor another seller can confirm it, the manager can", async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const reference = await cashOrder(seller);

    await test.step('the seller who took it cannot confirm it', () => cannotConfirm(seller, reference));

    const seller2 = await signIn(browser, 'seller', fixture.people.seller2.email);
    await test.step('another seller cannot confirm it either', () => cannotConfirm(seller2, reference));

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await test.step('the store manager can', () => confirmPayment(manager, reference));
});

test("a manager's own cash: that manager cannot confirm it, a second manager of the store can", async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const reference = await test.step('the manager sells and takes cash themselves', () => cashOrder(manager));

    await test.step('the manager cannot confirm their own cash', () => cannotConfirm(manager, reference));

    const manager2 = await signIn(browser, 'seller', fixture.people.manager2.email);
    await test.step('a second manager of the store sees it waiting and confirms it', async () => {
        await expectInManagerInbox(manager2, reference);
        await confirmPayment(manager2, reference);
    });
});

test("a manager's own cash: the store admin confirms it from Admin → Payments", async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const reference = await test.step('the manager sells and takes cash themselves', () => cashOrder(manager));

    const storeAdmin = await signIn(browser, 'admin', fixture.people.storeAdmin.email);
    await test.step('the store admin finds it waiting and confirms it', async () => {
        await storeAdmin.goto(app('admin', '/payments'));
        const part = storeAdmin.getByTestId(`to-confirm-${reference}`);
        await expect(part).toContainText(/cash/i);
        await part.getByRole('button', { name: 'Confirm received' }).click();
        await storeAdmin.getByRole('dialog').getByRole('button', { name: 'Yes, confirm' }).click();
        await expect(part).toHaveCount(0);
    });

    await test.step('the manager sees the order paid', async () => {
        await manager.goto(app('seller', '/orders?tab=paid'));
        await expect(manager.getByText(reference).first()).toBeVisible();
    });
});
