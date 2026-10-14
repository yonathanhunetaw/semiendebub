import { expect, test } from '@playwright/test';
import { addFirstVariant, confirmPart, confirmPayment, deliveryMethod, openCheckout, placeOrder, startCart } from '../../lib/flows';
import { saleOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';

/**
 * One order paid two ways: half cash, half into the bank account. Each part needs its own second
 * person, and the order reaches Pick & pack only when both are confirmed.
 */
test('half cash, half bank: the order waits until both parts are confirmed', async ({ browser }) => {
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const cartId = await startCart(seller, null);
    await addFirstVariant(seller, cartId, fixture.items[0].item_id);
    await openCheckout(seller, cartId);

    const reference = await test.step('checkout: add a bank part and a cash part, split equally', async () => {
        await seller.getByRole('button', { name: new RegExp(fixture.account.number) }).click();
        await seller.getByRole('button', { name: /Cash Taken by you now/ }).click();
        await seller.getByRole('button', { name: 'Split equally' }).click();
        await expect(seller.getByText('2 parts')).toBeVisible();
        await expect(seller.getByText('Balanced')).toBeVisible();
        await deliveryMethod(seller, 'Add later').click();

        return placeOrder(seller, 'Place order & request confirmation');
    });

    const sale = saleOf(reference);
    await test.step('two parts that add up to the total', () => {
        expect(sale.payments.map((p) => p.method).sort()).toEqual(['bank', 'cash'].sort());
        expect(sale.payments.reduce((sum, p) => sum + p.amount, 0)).toBeCloseTo(sale.total, 2);
    });

    await test.step('the manager confirms the cash: still waiting on the bank part', async () => {
        await confirmPart(manager, reference);
        expect(saleOf(reference).payments.filter((p) => p.status === 'confirmed').map((p) => p.method)).toEqual(['cash']);
        expect(saleOf(reference).stage).toBe('awaiting_payment');
    });

    await test.step('the seller says the customer paid the bank part, the owner confirms: Pick & pack', async () => {
        await seller.goto(app('seller', `/orders/${reference}/pay`));
        await seller.getByRole('button', { name: 'Customer says paid' }).click();
        await confirmPayment(manager, reference);
        expect(saleOf(reference)).toMatchObject({ stage: 'pick_pack' });
        expect(saleOf(reference).payments.every((p) => p.status === 'confirmed')).toBe(true);
    });
});
