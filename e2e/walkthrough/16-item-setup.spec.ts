import { expect, test } from '@playwright/test';
import { app, fixture, signIn, closeWindows } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * The item setup page, on the dev database (make walkthrough). Demo Admin opens one item's
 * setup page and works it part by part, the way a new item is made ready:
 *
 *   1. opens Admin → Items → the item → Setup and reads the Ready percentage
 *   2. types a discount in Prices, leaves the page, comes back: the unsaved input is still there
 *   3. saves the prices: the page confirms and the percentage is kept up to date
 *   4. sets the item's shelf limits in Placement (the admin may; a part someone else owns is read only)
 *   5. the Ready percentage did not fall (it rises the first time the bin is set)
 */
const item = fixture.items[1];

test('item setup: prices with a kept draft, then shelf limits, and the score follows', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const percent = async () => Number(((await admin.getByTestId('ready-percent').innerText()) || '0').replace('%', ''));
    const url = app('admin', `/items/${item.item_id}/setup`);
    let discountNow = '';

    const before = await test.step(`1. open the setup page of "${item.name}"`, async () => {
        await admin.goto(url);
        await expect(admin.getByRole('heading', { name: item.name })).toBeVisible();
        await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();

        return percent();
    });

    await test.step('2. type a discount, leave the page, come back: the input is kept', async () => {
        // A value different from the saved one, so every run has a real change to keep.
        const discount = admin.getByRole('spinbutton', { name: /^Discount (?!ends)/ }).first();
        discountNow = (await discount.inputValue()) === '0.55' ? '0.65' : '0.55';
        await discount.fill(discountNow);
        await admin.getByLabel(/^Discount ends/).first().fill('2030-01-01');
        await admin.goto(app('admin', '/items'));
        await admin.goto(url);
        await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();
        await expect(admin.getByText('Your unsaved changes were kept from last time.')).toBeVisible();
        await expect(admin.getByRole('spinbutton', { name: /^Discount (?!ends)/ }).first()).toHaveValue(discountNow);
    });

    await test.step('3. save the prices', async () => {
        await admin.getByRole('button', { name: 'Save prices' }).click();
        await expect(admin.getByText(new RegExp(`Prices saved for ${fixture.store.name}`)).first()).toBeVisible();
        await expect(admin.getByText('Your unsaved changes were kept from last time.')).toHaveCount(0);
    });

    await test.step('4. set the shelf limits (full one more than before, refill at 8, critical at 2)', async () => {
        // A different "full" every run, so there is always a real change to save.
        const max = admin.getByLabel('Store Shelf max');
        const next = String(Number((await max.inputValue()) || '19') + 1);
        await max.fill(next);
        await admin.getByLabel('Store Shelf refill').fill('8');
        await admin.getByLabel('Store Shelf critical').fill('2');
        await admin.getByRole('button', { name: 'Save limits' }).first().click();
        await expect(admin.getByText(/limits at Store Shelf saved/).first()).toBeVisible();
    });

    await test.step('5. the Ready percentage went up', async () => {
        // It rises the first time an item gets its bin; on a rerun the bin already counts, so it only must not fall.
        await expect.poll(percent).toBeGreaterThanOrEqual(before);
    });

    console.log(`
  Walkthrough done: "${item.name}" set up part by part: Ready ${before}% → ${await percent()}%.
  Where to look (password in e2e/.fixture/demo.json):
    Admin   ${fixture.people.admin.email}    ${url}
`);
});
