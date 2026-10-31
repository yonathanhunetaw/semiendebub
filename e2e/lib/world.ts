import { expect, type Page } from '@playwright/test';
import { app } from './support';

/** Opens the Guide world on an app and steps into Play, whether or not this device was in it already. */
export async function playIn(page: Page, subdomain: 'stockkeeper' | 'seller' | 'delivery' | 'admin'): Promise<void> {
    await page.goto(app(subdomain, '/guide?view=world'));
    const start = page.getByRole('button', { name: 'Play as a worker' });
    const follow = page.getByRole('button', { name: 'Follow', exact: true });
    // The page may still be re-rendering as the day loads: press Play until Play is on.
    await expect(async () => {
        if (await start.isVisible()) await start.click({ timeout: 2_000 });
        await expect(follow).toBeVisible({ timeout: 3_000 });
    }).toPass({ timeout: 45_000 });
}

/**
 * Play's jobs sit in the top bar: one job is its own button, several fold into the "Jobs" drop-down. Taps the job
 * matching `objective` either way (it walks the worker there).
 */
export async function tapJob(page: Page, objective: RegExp): Promise<void> {
    const direct = page.getByRole('button', { name: objective });
    if (await direct.first().isVisible().catch(() => false)) return direct.first().click();
    await page.getByRole('button', { name: /^Jobs/ }).click();
    await page.getByRole('menuitem', { name: objective }).click();
}

/** Expects a job (or a note in the jobs list) to say `text`, opening the Jobs drop-down when the jobs are folded. */
export async function expectJob(page: Page, text: RegExp, timeout = 15_000): Promise<void> {
    await expect(page.getByText(text).or(page.getByRole('button', { name: /^Jobs/ })).first()).toBeVisible({ timeout });
    const folded = page.getByRole('button', { name: /^Jobs/ });
    if (await folded.isVisible().catch(() => false)) {
        await folded.click();
        await expect(page.getByRole('menuitem', { name: text }).first()).toBeVisible({ timeout });
        await page.keyboard.press('Escape');
        return;
    }
    await expect(page.getByText(text).first()).toBeVisible({ timeout });
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
    await expect(page.getByTestId(`station-${station}`)).toBeVisible({ timeout: 120_000 });
}
