import { expect, test } from '@playwright/test';
import { addFirstVariant, confirmPayment, courierDelivery, deliver, openCheckout, payInCash, pickAndPack, placeOrder, startCart } from '../../lib/flows';
import { saleOf, stockOf } from '../../lib/inspect';
import { shipToRemoteHub } from '../../lib/shipments';
import { app, fixture, signIn } from '../../lib/support';

/**
 * An item only the main hub holds, sold and delivered: checkout holds it at the hub and the buyer
 * agrees to wait; once paid it sits in Pick & pack until a shipment brings it to the store's
 * Remote Hub; then it is picked from there and the courier delivers it. The ledger is checked at
 * each place it passes through.
 */
const hubOnly = fixture.noStockItem.hubOnly!;
const shipped = 2;

/** Units of the hub-only variant at the main hub, the Remote Hub, the store (shelf + floor) and with couriers. */
const where = () => {
    const stock = stockOf(hubOnly.variant);
    const at = (id: number) => stock[String(id)] ?? 0;
    const { hub, remoteHub, shelf, floor, transit } = fixture.locations;

    return { hub: at(hub), remoteHub: at(remoteHub), store: at(shelf) + at(floor), transit: at(transit) };
};

test('an item only the hub has: held there, shipped to the Remote Hub, picked and delivered', async ({ browser }) => {
    test.setTimeout(240_000);
    test.skip(!fixture.noStockItem.hubOnly, 'the dev data has no main hub');
    const before = where();
    const seller = await signIn(browser, 'seller', fixture.seller.email);

    const reference = await test.step('a walk-in buys it for delivery and pays cash; the buyer agrees to wait', async () => {
        const cartId = await startCart(seller, null);
        await addFirstVariant(seller, cartId, fixture.noStockItem.item_id);
        await openCheckout(seller, cartId);
        await expect(seller.getByText('Some lines are not on hand at this store.')).toBeVisible();
        await courierDelivery(seller);
        await payInCash(seller);

        return placeOrder(seller, 'Place order & request confirmation');
    });

    await test.step('the unit is held at the main hub; nothing has moved', () => {
        expect(saleOf(reference).holds).toEqual([
            expect.objectContaining({ variant: hubOnly.variant, quantity: 1, status: 'open', location: fixture.locations.hub }),
        ]);
        expect(where()).toEqual(before);
    });

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await test.step('the store manager confirms the cash', () => confirmPayment(manager, reference));

    await test.step('paid, but Pick & pack has nowhere to pick it from yet', async () => {
        expect(saleOf(reference).stage).toBe('pick_pack');
        await seller.goto(app('seller', `/orders/${reference}/pick-pack`));
        await expect(seller.getByText(reference).first()).toBeVisible();
        await expect(seller.getByRole('button', { name: /^back_hand\s*I have \d+ from/ })).toHaveCount(0);
    });

    await test.step(`a shipment brings ${shipped} from the main hub to the Remote Hub`, async () => {
        await shipToRemoteHub(browser, { sku: hubOnly.sku, label: hubOnly.label, quantity: shipped });
        expect(where()).toEqual({ ...before, hub: before.hub - shipped, remoteHub: before.remoteHub + shipped });
    });

    await test.step('the seller picks it from the Remote Hub and hands it to delivery', async () => {
        await pickAndPack(seller, reference, 'delivery');
        const sale = saleOf(reference);
        expect(sale.stage).toBe('to_deliver');
        expect(sale.holds.map((h) => h.status)).toEqual(['picked']);
    });

    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await test.step('the courier delivers it', () => deliver(courier, reference));

    await test.step('delivered: one unit left the Remote Hub for the customer, the other stays there', () => {
        expect(saleOf(reference).stage).toBe('delivered');
        expect(where()).toEqual({ ...before, hub: before.hub - shipped, remoteHub: before.remoteHub + shipped - 1 });
    });
});
