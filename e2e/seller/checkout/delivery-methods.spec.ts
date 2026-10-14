import { expect, test } from '@playwright/test';
import { addFirstVariant, courierDelivery, deliveryMethod, expectInManagerInbox, openCheckout, payInCash, placeOrder, run, startCart } from '../../lib/flows';
import { fixture, signIn } from '../../lib/support';

/**
 * Each delivery method, with cash from a walk-in: the order is placed and waits for the manager.
 * Short on purpose; the full pick-and-deliver journeys live in order-flow and walk-in.
 */
const methods: Array<{ name: 'In store' | 'Standard delivery' | 'Vehicle dispatch' | 'Add later'; fill: (page: import('@playwright/test').Page) => Promise<void> }> = [
    { name: 'In store', fill: async () => {} },
    { name: 'Standard delivery', fill: courierDelivery },
    {
        name: 'Vehicle dispatch',
        fill: async (page) => {
            await page.getByLabel('Plate number').fill(`3-E${run}`);
            await page.getByLabel('Driver phone').fill('0911000001');
            await page.getByLabel('Receiver name').fill('E2E Driver');
        },
    },
    { name: 'Add later', fill: async () => {} },
];

for (const { name, fill } of methods) {
    test(`walk-in, cash, delivery "${name}": placed and waiting for the manager`, async ({ browser }) => {
        const manager = await signIn(browser, 'seller', fixture.manager.email);
        const seller = await signIn(browser, 'seller', fixture.seller.email);

        const cartId = await startCart(seller, null);
        await addFirstVariant(seller, cartId, fixture.items[0].item_id);

        await openCheckout(seller, cartId);
        await deliveryMethod(seller, name).click();
        await expect(deliveryMethod(seller, name)).toHaveAttribute('aria-checked', 'true');
        await fill(seller);
        await payInCash(seller);

        const reference = await placeOrder(seller, 'Place order & request confirmation');
        await expectInManagerInbox(manager, reference);
    });
}
