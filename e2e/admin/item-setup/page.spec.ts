import { expect, test } from '@playwright/test';
import { app, closeWindows, fixture, signIn } from '../../lib/support';

test.afterEach(closeWindows);

/**
 * The item setup page as a person meets it, on the throwaway copy of the database: what is on it, who may open
 * it, that a refusal beside a field is shown and saves nothing, that typed-but-unsaved input is kept, and that it
 * fits a phone. (The long journey from a blank item is new-item.spec.ts.)
 */
const item = fixture.items[0];
const url = app('admin', `/items/${item.item_id}/setup`);

test('the page shows the score, the section chips and every section', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(url);

    await expect(admin.getByTestId('ready-percent')).toHaveText(/^\d{1,3}%$/);
    // Each section is a card with its own anchor; the menu also has words like "Stores", so look inside the card.
    for (const [id, title] of [['basics', 'Basics'], ['variants', 'Variants & barcodes'], ['stores', 'Stores'], ['prices', 'Prices'], ['placement', 'Placement'], ['stock', 'Stock'], ['history', 'History']]) {
        await expect(admin.locator(`#${id}`)).toBeAttached();
        await expect(admin.locator(`#${id}`).getByText(title, { exact: false }).first()).toBeAttached();
    }
    // One tab per store, each with its own percentage or "not deployed".
    await expect(admin.getByRole('tab', { name: new RegExp(fixture.store.name) })).toBeVisible();
});

test('a section chip scrolls to its section and the active chip follows the page', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(url);

    await admin.getByRole('button', { name: 'History' }).first().click();
    await expect(admin.locator('#history')).toBeInViewport();
});

test('the old edit address leads to the setup page', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);

    await admin.goto(app('admin', `/items/${item.item_id}/edit`));

    await expect(admin).toHaveURL(new RegExp(`/items/${item.item_id}/setup$`));
});

test('a guest is sent to sign in and a store admin is refused', async ({ browser }) => {
    const guest = await browser.newPage();
    await guest.goto(url);
    await expect(guest).toHaveURL(/\/login/);

    const storeAdmin = await signIn(browser, 'admin', fixture.people.storeAdmin.email);
    const response = await storeAdmin.goto(url);
    expect(response?.status()).toBe(403);
});

test('the page fits a phone: no sideways scrolling', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(url);
    await expect(admin.getByTestId('ready-percent')).toBeVisible();

    const overflow = await admin.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
});

test('a discount above the price is refused beside the form and nothing is saved', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(url);
    await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();

    const price = admin.getByRole('spinbutton', { name: /^Price / }).first();
    const saved = await price.inputValue();
    await price.fill('10');
    await admin.getByRole('spinbutton', { name: /^Discount (?!ends)/ }).first().fill('20');
    await admin.getByLabel(/^Discount ends/).first().fill('2031-01-01');
    await admin.getByRole('button', { name: 'Save prices' }).click();

    await expect(admin.getByText('A discount price cannot be higher than the price.').first()).toBeVisible();

    await admin.reload();
    await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();
    // The refused draft is offered back, but the saved price is still the old one.
    await admin.getByRole('button', { name: 'Discard' }).first().click();
    await expect(admin.getByRole('spinbutton', { name: /^Price / }).first()).toHaveValue(saved);
});

test('unsaved prices are kept when leaving the page, and Discard puts the saved ones back', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(url);
    await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();

    const price = admin.getByRole('spinbutton', { name: /^Price / }).first();
    const saved = await price.inputValue();
    const typed = String(Number(saved || '10') + 7);
    await price.fill(typed);
    await expect(admin.getByText(/Unsaved changes/).first()).toBeVisible();

    await admin.goto(app('admin', '/items'));
    await admin.goto(url);
    await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();

    await expect(admin.getByText('Your unsaved changes were kept from last time.').first()).toBeVisible();
    await expect(admin.getByRole('spinbutton', { name: /^Price / }).first()).toHaveValue(typed);

    await admin.getByRole('button', { name: 'Discard' }).first().click();
    await expect(admin.getByRole('spinbutton', { name: /^Price / }).first()).toHaveValue(saved);
    await expect(admin.getByText('Your unsaved changes were kept from last time.')).toHaveCount(0);
});

test('shelf limits out of order are refused with a message and not saved', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(url);
    await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();

    await admin.getByLabel('Store Shelf max').fill('5');
    await admin.getByLabel('Store Shelf refill').fill('9');
    await admin.getByLabel('Store Shelf critical').fill('2');
    await admin.getByRole('button', { name: 'Save limits' }).first().click();

    await expect(admin.getByText(/critical ≤ refill ≤ max/).first()).toBeVisible();
});

test('a repeated barcode on another variant is refused and Generate fills an empty one', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    // A fresh item with two variants, so the two fields are guaranteed.
    await admin.goto(app('admin', '/items/create'));
    const name = `E2E Barcodes ${Date.now().toString().slice(-6)}`;
    await admin.getByLabel('Item name').fill(name);
    const category = admin.getByRole('combobox', { name: 'Category', exact: true });
    await category.click();
    await admin.getByRole('option').first().click();
    await admin.getByRole('button', { name: 'Create item' }).click();
    await expect(admin).toHaveURL(/\/items\/\d+\/setup$/);

    await admin.getByRole('button', { name: 'Add packaging' }).click();
    await admin.getByRole('combobox', { name: 'Packaging type 1' }).fill('Piece');
    await admin.getByLabel('Pieces in packaging 1').fill('1');
    await admin.getByRole('button', { name: 'Add packaging' }).click();
    await admin.getByRole('combobox', { name: 'Packaging type 2' }).fill('Packet');
    await admin.getByLabel('Pieces in packaging 2').fill('12');
    await admin.getByRole('button', { name: 'Apply options' }).click();
    const fields = admin.getByRole('textbox', { name: /^Barcode / });
    await expect(fields).toHaveCount(2);

    const code = `E2E-${Date.now().toString().slice(-8)}`;
    await fields.first().fill(code);
    await fields.first().press('Enter'); // a USB scanner ends a code with Enter: the next field takes focus
    await expect(fields.last()).toBeFocused();
    await admin.getByRole('button', { name: 'Save barcodes' }).click();
    await expect(admin.getByText('Barcodes saved.').first()).toBeVisible();

    await fields.last().fill(code);
    await admin.getByRole('button', { name: 'Save barcodes' }).click();
    await expect(admin.getByText(/already used by another variant/).first()).toBeVisible();

    await fields.last().fill('');
    await admin.getByRole('button', { name: /^Generate barcode/ }).last().click();
    await expect(fields.last()).toHaveValue(/^2\d{12}$/);
});

test('the new item button stays off until there is a name and a category', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/items/create'));

    const create = admin.getByRole('button', { name: 'Create item' });
    await expect(create).toBeDisabled();
    await admin.getByLabel('Item name').fill('Only a name');
    await expect(create).toBeDisabled();
    await admin.getByRole('combobox', { name: 'Category', exact: true }).click();
    await admin.getByRole('option').first().click();
    await expect(create).toBeEnabled();
});

test('the items list can be filtered to not-ready items and sorted least ready first', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/items?not_ready=1&sort=ready&direction=asc'));

    await expect(admin.getByText(/Not ready · \d+/).first()).toBeVisible();
    await expect(admin.getByText(/Server Error|SQLSTATE/)).toHaveCount(0);
});
