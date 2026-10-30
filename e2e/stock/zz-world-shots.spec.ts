import { expect, test } from '@playwright/test';
import { closeWindows, fixture, signIn } from '../lib/support';
import { playIn } from '../lib/world';

test.afterEach(async () => closeWindows());
const out = '/private/tmp/claude-501/-Users-baby-Desktop-Duka/a1555f4d-e4c1-4519-8f13-6d1ebd66ebc9/scratchpad';

for (const [name, size] of [['phone', { width: 390, height: 844 }], ['desk', { width: 1280, height: 760 }]] as const) {
    test(`world ${name}`, async ({ browser }) => {
        test.setTimeout(300_000);
        const page = await signIn(browser, 'admin', fixture.people.admin.email);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.setViewportSize(size);
        await playIn(page, 'admin');
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${out}/w-${name}-1play.png` });
        await page.getByRole('button', { name: 'Director', exact: true }).click();
        await page.waitForTimeout(1800);
        await page.locator('.world-label', { hasText: 'Main Hub A' }).first().click({ force: true });
        await page.waitForTimeout(2200);
        await page.screenshot({ path: `${out}/w-${name}-2hub.png` });
        await page.getByTestId('item-finder-open').click();
        await page.waitForTimeout(600);
        await page.screenshot({ path: `${out}/w-${name}-3open.png` });
        await page.getByRole('option').first().click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${out}/w-${name}-4picked.png` });
        await expect(page.getByTestId('item-finder-result')).toBeVisible();
        expect(errors).toEqual([]);
    });
}
