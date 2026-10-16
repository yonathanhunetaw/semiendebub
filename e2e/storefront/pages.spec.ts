import { expect, test } from '@playwright/test';
import { sweep } from '../lib/pages';

/** The public shop on the root domain, as a guest: the list and the first item it links to. */
test('guest: the shop and an item page open without errors', async ({ page }) => {
    const faults = await sweep(page, ['/', '/shop']);
    const item = await page.locator('a[href*="/shop/items/"]').first().getAttribute('href');
    expect(item, 'the shop links to an item').toBeTruthy();
    faults.push(...await sweep(page, [new URL(item!, page.url()).pathname]));
    expect(faults, faults.join('\n')).toEqual([]);
});
