import { expect, test, type Page } from '@playwright/test';
import { unitsAt } from '../lib/inspect';
import { checkAll, sign, tomorrowAtTen } from '../lib/shipments';
import { app, fixture, signIn } from '../lib/support';

/**
 * Freight from the main hub to the store's Remote Hub, through every person it needs:
 *
 *   admin           opens the shipment, proposes a time, builds the manifest, offers it to a driver
 *   hub keeper      agrees for the origin dock          (staff of Main Distribution Hub A)
 *   store keeper    agrees for the destination dock     (Main Store's stock keeper)
 *   courier         agrees to drive it                  → four of four: scheduled
 *   hub keeper      starts picking, picks the line, marks it prepared in a bay
 *   courier         starts the trip, checks the load, signs for it, arrives
 *   store keeper    checks the goods and signs them in  → received
 */
const quantity = 3;

test('shipment Hub A → Remote Hub: agreed by all four, picked, carried and signed in', async ({ browser }) => {
    test.setTimeout(180_000);
    const variant = fixture.hubVariant.id;
    const { hub, remoteHub, transit } = fixture.locations;
    const before = { hub: unitsAt(variant, hub), remote: unitsAt(variant, remoteHub), transit: unitsAt(variant, transit) };
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);

    const shipmentId = await test.step('admin opens the shipment and proposes tomorrow 10:00', async () => {
        await admin.goto(app('admin', '/inventory/shipments'));
        await admin.getByRole('button', { name: 'New shipment' }).click();
        const dialog = admin.getByRole('dialog');
        await dialog.getByLabel('Origin').click();
        await admin.getByRole('option', { name: fixture.hub.name }).click();
        await dialog.getByLabel('Destination').click();
        await admin.getByRole('option', { name: new RegExp(fixture.remoteHub.name) }).first().click();
        await dialog.getByLabel('Scheduled for').fill(tomorrowAtTen());
        await dialog.getByRole('button', { name: 'Create' }).click();
        await expect(admin).toHaveURL(/\/inventory\/shipments\/\d+$/);

        return Number(new URL(admin.url()).pathname.split('/').pop());
    });

    await test.step('admin puts the hub variant on the manifest', async () => {
        // The picker lists what the hub holds, labelled with packaging and SKU.
        await admin.getByLabel('SKU').fill(fixture.hubVariant.sku);
        await admin.getByRole('option', { name: fixture.hubVariant.label }).click();
        await admin.getByLabel('Qty').fill(String(quantity));
        await admin.getByRole('button', { name: 'Add', exact: true }).click();
        await expect(admin.getByText('Manifest updated.')).toBeVisible();
    });

    await test.step('admin offers the run to the E2E courier', async () => {
        await admin.getByLabel('Drivers offered').click();
        await admin.getByRole('option', { name: fixture.courier.name }).click();
        await admin.keyboard.press('Escape');
        await admin.getByRole('button', { name: 'Save', exact: true }).click();
        await expect(admin.getByText(fixture.courier.name).first()).toBeVisible();
    });

    const hubKeeper = await signIn(browser, 'stockkeeper', fixture.people.hubKeeper.email);
    const storeKeeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const courier = await signIn(browser, 'delivery', fixture.courier.email);

    /** Accepts the proposed window and waits for the seat's tick, e.g. "Origin Agreed". */
    const agree = async (page: Page, url: string, tick: RegExp) => {
        await page.goto(url);
        await page.getByRole('button', { name: /^Accept / }).click();
        await expect(page.getByText(tick).first()).toBeVisible();
    };

    await test.step('the hub keeper agrees for the origin dock, the only seat they are offered', async () => {
        await hubKeeper.goto(app('stockkeeper', `/shipments/${shipmentId}`));
        // A keeper with no store covers every dock, but the Remote Hub has its own people,
        // so only the origin's seat is theirs: no seat picker, straight to Accept.
        await expect(hubKeeper.getByRole('button', { name: /^4\. Dest\./ })).toHaveCount(0);
        await agree(hubKeeper, app('stockkeeper', `/shipments/${shipmentId}`), /Origin Agreed/);
    });
    await test.step('the store keeper agrees for the destination dock', () =>
        agree(storeKeeper, app('stockkeeper', `/shipments/${shipmentId}`), /Destination Agreed/));
    await test.step('the courier agrees to drive it: four of four, scheduled', async () => {
        await agree(courier, app('delivery', `/shipments/${shipmentId}`), /Driver Accepted|All parties agreed|Agreed ·/);
        await expect(courier.getByText(/All parties agreed|Agreed ·/).first()).toBeVisible();
    });

    await test.step('the hub keeper picks the line and prepares it in a bay', async () => {
        await hubKeeper.goto(app('stockkeeper', `/shipments/${shipmentId}`));
        // The window is shown as proposed (10:00), not shifted by the browser's zone.
        await expect(hubKeeper.getByText('Agreed window:')).toContainText(/10:00/);
        await hubKeeper.getByRole('button', { name: 'Start picking' }).click();
        await hubKeeper.getByRole('button', { name: new RegExp(fixture.hubVariant.label.split(' — ')[0]) }).first().click();
        await hubKeeper.getByLabel('Pickup bay').fill('Bay 1');
        await hubKeeper.getByRole('button', { name: 'Mark prepared' }).click();
        await expect(hubKeeper.getByText('Prepared for pickup')).toBeVisible();
    });

    await test.step('the courier starts the trip, checks and signs for the load, then arrives', async () => {
        await courier.goto(app('delivery', `/shipments/${shipmentId}`));
        await courier.getByRole('button', { name: /^Start trip to/ }).click();
        await courier.getByRole('button', { name: /Check the load/ }).click();
        await checkAll(courier);
        await courier.getByRole('button', { name: /Sign & take the load/ }).click();
        await sign(courier, /^Sign$/);
        // Signed for: it left the hub and is in the courier's hands.
        expect(unitsAt(variant, hub)).toBe(before.hub - quantity);
        expect(unitsAt(variant, transit)).toBe(before.transit + quantity);
        await courier.getByRole('button', { name: /^Arrived at/ }).click();
        await expect(courier.getByRole('button', { name: /^Arrived at/ })).toHaveCount(0);
    });

    await test.step('the store keeper checks the goods and signs them in', async () => {
        await storeKeeper.goto(app('stockkeeper', `/shipments/${shipmentId}`));
        await storeKeeper.getByRole('button', { name: /Check the goods/ }).click();
        await checkAll(storeKeeper);
        await storeKeeper.getByRole('button', { name: /Sign/ }).first().click();
        await sign(storeKeeper, /^Sign$/);
        await expect(storeKeeper.getByText('Finished').first()).toBeVisible();
        // Signed in: it landed in the Remote Hub, and nothing is left in transit.
        expect(unitsAt(variant, remoteHub)).toBe(before.remote + quantity);
        expect(unitsAt(variant, transit)).toBe(before.transit);
        expect(unitsAt(variant, hub)).toBe(before.hub - quantity);
    });
});
