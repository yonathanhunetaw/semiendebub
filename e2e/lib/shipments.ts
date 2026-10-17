import { expect, type Page } from '@playwright/test';

/** Shared by the shipment spec and the shipment walkthrough. */

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
