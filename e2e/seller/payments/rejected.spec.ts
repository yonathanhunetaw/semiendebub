import { expect, test } from '@playwright/test';
import { addFirstVariant, courierDelivery, openCheckout, payIntoAccount, placeOrder, startCart } from '../../lib/flows';
import { saleOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';

/**
 * The account's owner checks the bank and finds nothing: "Not received yet" sends the part back
 * to the seller, who sees why on the To pay page. Once the customer has really paid, the seller
 * says so again and the owner confirms. The order stays in To pay until then.
 */
test('a deposit the owner cannot find goes back to the seller, then is confirmed once it arrives', async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const cartId = await startCart(seller, null);
    await addFirstVariant(seller, cartId, fixture.items[0].item_id);
    await openCheckout(seller, cartId);
    await payIntoAccount(seller);
    await courierDelivery(seller);
    const reference = await placeOrder(seller, 'Place order & request confirmation');

    const customerSaysPaid = async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        await seller.getByRole('button', { name: 'Customer says paid' }).click();
        await expect(seller.getByText('will check the account and confirm it')).toBeVisible();
    };
    const card = () => manager.locator('div.rounded-\\[16px\\]').filter({ hasText: reference });

    await test.step('the seller says the customer paid', customerSaysPaid);

    await test.step('the owner finds no deposit: Not received yet', async () => {
        await manager.goto(app('seller', '/payments/inbox'));
        await card().first().getByRole('button', { name: 'Not received yet' }).click();
        // It waits as an expected deposit the owner may confirm the moment it shows up.
        await expect(card().first().getByRole('button', { name: 'Not received yet' })).toHaveCount(0);
        await expect(card().first().getByRole('button', { name: 'It arrived · confirm' })).toBeVisible();
        expect(saleOf(reference).stage).toBe('awaiting_payment');
        expect(saleOf(reference).payments.map((p) => p.status)).toEqual(['pending']);
    });

    await test.step('the seller sees why on the To pay page', async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        await expect(seller.getByText(/Not received yet: .* found no deposit/)).toBeVisible();
    });

    await test.step('the customer pays for real; the seller says so again and the owner confirms', async () => {
        await customerSaysPaid();
        await manager.goto(app('seller', '/payments/inbox'));
        await card().first().getByRole('button', { name: 'Confirm received' }).click();
        await manager.getByRole('dialog').getByRole('button', { name: 'Yes, confirm' }).click();
        await expect(card()).toHaveCount(0);
        expect(saleOf(reference)).toMatchObject({ stage: 'pick_pack', payments: [{ status: 'confirmed' }] });
    });
});
