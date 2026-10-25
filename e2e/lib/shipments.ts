import { expect, type Browser, type Page } from '@playwright/test';
import { app, fixture, signIn } from './support';

/** Shared by the shipment spec, the shipment walkthrough and the hub-sourced order. */

/** Tomorrow at 10:00, as the datetime-local input wants it. */
export function tomorrowAtTen(): string {
    const d = new Date(Date.now() + 24 * 3600 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');

    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`;
}

/** The signature dialogs: scribble on the canvas, then confirm. */
export async function sign(page: Page, confirm: RegExp): Promise<void> {
    const dialog = page.getByRole('dialog');
    const pad = dialog.locator('canvas');
    await expect(pad).toBeVisible();
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + 20, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 15, { steps: 8 });
    await page.mouse.move(box.x + box.width - 20, box.y + box.height - 15, { steps: 8 });
    await page.mouse.up();
    await dialog.getByRole('button', { name: confirm }).click();
    await expect(dialog).toBeHidden();
}

/** The "check" dialogs: tick every line, then confirm it is all there. */
export async function checkAll(page: Page): Promise<void> {
    const dialog = page.getByRole('dialog');
    for (const line of await dialog.getByRole('checkbox').all()) {
        await line.click();
    }
    await dialog.getByRole('button', { name: 'All counted' }).click();
    await expect(dialog).toBeHidden();
}

/** The admin's manifest picker: find the item by its SKU, then choose that SKU among the item's. */
export async function addToManifest(admin: Page, sku: string): Promise<void> {
    await admin.getByPlaceholder('Search by name, SKU or barcode').fill(sku);
    await admin.getByRole('button', { name: /\d+ SKUs?$/ }).first().click();
    await admin.getByRole('button').filter({ hasText: sku }).first().click();
}

/**
 * Freight of one variant from the main hub to the store's Remote Hub, start to finish: the admin
 * opens it, all four seats agree, the hub keeper picks, the courier carries, the store keeper signs in.
 * stock/shipment.spec.ts walks the same road step by step, with its checks.
 */
export async function shipToRemoteHub(browser: Browser, line: { sku: string; label: string; quantity: number }): Promise<void> {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
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
    const id = Number(new URL(admin.url()).pathname.split('/').pop());

    await addToManifest(admin, line.sku);
    await admin.getByLabel('Qty').fill(String(line.quantity));
    await admin.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(admin.getByText('Manifest updated.')).toBeVisible();
    await admin.getByLabel('Drivers offered').click();
    await admin.getByRole('option', { name: fixture.courier.name }).click();
    await admin.keyboard.press('Escape');
    await admin.getByRole('button', { name: 'Save', exact: true }).click();
    await expect(admin.getByText(fixture.courier.name).first()).toBeVisible();

    const hubKeeper = await signIn(browser, 'stockkeeper', fixture.people.hubKeeper.email);
    const storeKeeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    const agree = async (page: Page, url: string, tick: RegExp) => {
        await page.goto(url);
        await page.getByRole('button', { name: /^Accept / }).click();
        await expect(page.getByText(tick).first()).toBeVisible();
    };
    await agree(hubKeeper, app('stockkeeper', `/shipments/${id}`), /Origin Agreed/);
    await agree(storeKeeper, app('stockkeeper', `/shipments/${id}`), /Destination Agreed/);
    await agree(courier, app('delivery', `/shipments/${id}`), /Driver Accepted|All parties agreed|Agreed ·/);

    await hubKeeper.goto(app('stockkeeper', `/shipments/${id}`));
    await hubKeeper.getByRole('button', { name: 'Start picking' }).click();
    await hubKeeper.getByRole('button', { name: new RegExp(line.label.split(' — ')[0]) }).first().click();
    await hubKeeper.getByLabel('Pickup bay').fill('Bay 1');
    await hubKeeper.getByRole('button', { name: 'Mark prepared' }).click();
    await expect(hubKeeper.getByText('Prepared for pickup')).toBeVisible();

    await courier.goto(app('delivery', `/shipments/${id}`));
    await courier.getByRole('button', { name: /^Start trip to/ }).click();
    await courier.getByRole('button', { name: /Check the load/ }).click();
    await checkAll(courier);
    await courier.getByRole('button', { name: /Sign & take the load/ }).click();
    await sign(courier, /^Sign$/);
    await courier.getByRole('button', { name: /^Arrived at/ }).click();
    await expect(courier.getByRole('button', { name: /^Arrived at/ })).toHaveCount(0);

    await storeKeeper.goto(app('stockkeeper', `/shipments/${id}`));
    await storeKeeper.getByRole('button', { name: /Check the goods/ }).click();
    await checkAll(storeKeeper);
    await storeKeeper.getByRole('button', { name: /Sign/ }).first().click();
    await sign(storeKeeper, /^Sign$/);
    await expect(storeKeeper.getByText('Finished').first()).toBeVisible();
}
