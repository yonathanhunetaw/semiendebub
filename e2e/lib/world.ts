import { expect, type Page } from '@playwright/test';
import { app } from './support';

/** Opens the Guide world on an app and steps into Play, whether or not this device was in it already. */
export async function playIn(page: Page, subdomain: 'stockkeeper' | 'seller' | 'delivery' | 'admin'): Promise<void> {
    await page.goto(app(subdomain, '/guide?view=world'));
    const start = page.getByRole('button', { name: 'Play as a worker' });
    await expect(start.or(page.getByRole('button', { name: 'Follow', exact: true }))).toBeVisible({ timeout: 30_000 });
    if (await start.isVisible()) await start.click();
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
}

/** Switches Live on (confirming the first time). */
export async function goLive(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(page.getByText('Play for real?')).toBeVisible();
    await page.getByRole('button', { name: 'Go Live' }).click();
    await expect(page.getByRole('button', { name: 'Live', exact: true })).toHaveAttribute('aria-pressed', 'true');
}

/** Opens the Desks list and walks (hurrying) to the desk called `label`; resolves when its card shows. */
export async function walkToDesk(page: Page, label: string | RegExp, station: string): Promise<void> {
    await page.getByRole('button', { name: 'Desks', exact: true }).click();
    const menu = page.getByTestId('desk-menu');
    await expect(menu).toBeVisible();
    await menu.locator('div').filter({ hasText: label }).filter({ has: page.getByRole('button', { name: 'Go' }) }).last().getByRole('button', { name: 'Go' }).click();
    await page.keyboard.down('Shift');
    await expect(page.getByTestId(`station-${station}`)).toBeVisible({ timeout: 120_000 });
    await page.keyboard.up('Shift');
}
