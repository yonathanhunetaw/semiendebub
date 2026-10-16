import { expect, test } from '@playwright/test';
import { app, fixture, signIn } from '../lib/support';

/**
 * The Guide's Live Operations world: its timeline steps through what
 * happened, one event at a time, and the list and the cards follow.
 */
test('the world replays a busy day event by event', async ({ browser }) => {
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(app('admin', '/guide?view=world'));
    await expect(page.getByText('Live Operations')).toBeVisible();

    // Back to the last day something happened, played from its first event.
    await page.getByRole('button', { name: 'Previous day' }).click();
    const counter = page.getByText(/^\d+ \/ \d+$/);
    await expect(counter).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.screenshot({ path: 'test-results/guide-world-first.png' });

    const [, total] = (await counter.textContent())!.split(' / ').map(Number);
    if (total > 1) {
        const before = await counter.textContent();
        await page.getByRole('button', { name: 'Next event' }).click();
        await expect(counter).not.toHaveText(before!);
    }

    // The details card for the event on screen.
    await page.getByRole('button', { name: 'Details' }).click();
    await expect(page.getByText('What happened').first()).toBeVisible();
    await page.waitForTimeout(2500);
    await page.screenshot({ path: 'test-results/guide-world-details.png' });

    expect(errors).toEqual([]);
});

test('on a wide screen the list of events sits beside the world', async ({ browser }) => {
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(app('admin', '/guide?view=world'));
    await page.getByRole('button', { name: 'Previous day' }).click();
    await expect(page.getByText(/^\d+ \/ \d+$/)).toBeVisible({ timeout: 15_000 });

    // The list is open by default here; a tap on an event goes there.
    await expect(page.getByText('What happened')).toBeVisible();
    await page.getByRole('button', { name: 'Pause' }).click();
    await page.getByRole('button', { name: 'Next event' }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: 'test-results/guide-world-desktop.png' });

    // The address names the day and the event, so a link opens that very moment.
    const counter = page.getByText(/^\d+ \/ \d+$/);
    const shown = await counter.textContent();
    const link = new URL(page.url());
    expect(link.searchParams.get('day')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(link.searchParams.get('event')).toBeTruthy();
    await page.goto(link.toString());
    await expect(counter).toHaveText(shown!, { timeout: 15_000 });
});
