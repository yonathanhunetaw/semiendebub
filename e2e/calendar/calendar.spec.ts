import { expect, test, type Page } from '@playwright/test';
import { fixture, flash, signIn, type Subdomain } from '../lib/support';
import { sweep } from '../lib/pages';

/**
 * The calendar (Pages/Calendar/Index.tsx): it opens clean on every app that has
 * it, and a bill marked paid today comes back due next month, where it can be
 * ticked paid and is seen by a colleague at the same store.
 */

const apps: Array<[Subdomain, string, string]> = [
    ['admin', 'admin', fixture.people.admin.email],
    ['seller', 'seller', fixture.seller.email],
    ['stockkeeper', 'stock keeper', fixture.keeper.email],
    ['delivery', 'courier', fixture.courier.email],
    ['procurement', 'procurement', fixture.people.procurement.email],
];

for (const [subdomain, who, email] of apps) {
    test(`${who}: the calendar opens without errors`, async ({ browser }) => {
        test.setTimeout(120_000);
        const page = await signIn(browser, subdomain, email);
        const faults = await sweep(page, ['/calendar'], { details: false });
        expect(faults, faults.join('\n')).toEqual([]);
        await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
    });
}

/** Month view, moved `months` ahead of today. */
async function month(page: Page, months = 0): Promise<void> {
    await page.getByRole('button', { name: 'Month', exact: true }).click();
    await page.getByRole('button', { name: 'Today', exact: true }).click();
    for (let i = 0; i < months; i++) await page.getByRole('button', { name: 'Next', exact: true }).click();
}

test('seller: a bill paid today is due again next month and can be ticked paid there', async ({ browser }) => {
    test.setTimeout(180_000);
    const title = `E2E internet ${Date.now()}`;
    const event = (page: Page) => page.locator('.rbc-event').filter({ hasText: title });

    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.goto('/calendar');

    // Material Symbols icons are text ligatures, so a button reads "add Add": match the label's end.
    await seller.getByRole('button', { name: /Add$/ }).click();
    // A seller may also start a shipment or leave from a day: a note is the first choice.
    await seller.getByRole('dialog', { name: 'Add to this day' }).getByRole('button', { name: /Note or reminder/ }).click();
    const sheet = seller.getByRole('dialog', { name: 'Add to the calendar' });
    await sheet.getByRole('button', { name: /Bill$/ }).click();
    await sheet.getByLabel('Title').fill(title);
    await sheet.getByLabel('Repeats').selectOption('monthly');
    await sheet.getByLabel('Amount').fill('1500');
    await sheet.getByLabel('Paid to').fill('Ethio Telecom');
    await sheet.getByLabel(/Already paid this one/).check();
    await seller.getByRole('button', { name: /Save as paid$/ }).click();
    await expect(flash(seller, /marked paid, next one is on the calendar/)).toBeVisible();

    // Today: paid (struck through).
    await month(seller);
    await expect(event(seller)).toHaveClass(/state-done/);

    // Next month: due, then ticked paid from its sheet.
    await month(seller, 1);
    await expect(event(seller)).toHaveClass(/state-upcoming/);
    await event(seller).click();
    const details = seller.getByRole('dialog', { name: title });
    await expect(details.getByText('ETB 1,500')).toBeVisible();
    await expect(details.getByText('Every month')).toBeVisible();
    await details.getByRole('button', { name: /Mark paid$/ }).click();
    await expect(flash(seller, `"${title}" marked paid.`)).toBeVisible();
    await expect(event(seller)).toHaveClass(/state-done/);

    // Shared with the store: another seller there sees it.
    const colleague = await signIn(browser, 'seller', fixture.people.seller2.email);
    await colleague.goto('/calendar');
    await month(colleague, 1);
    await expect(event(colleague)).toBeVisible();
});

test('seller: an uploaded receipt is checked, then lands on the calendar as paid', async ({ browser }) => {
    test.setTimeout(180_000);
    const title = `E2E water ${Date.now()}`;
    // The smallest valid PNG: one transparent pixel.
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.goto('/calendar');

    await seller.getByRole('button', { name: /Upload receipt$/ }).click();
    const upload = seller.getByRole('dialog', { name: 'Upload a receipt or bill' });
    await upload.getByLabel('Receipt or bill').setInputFiles({ name: 'water.png', mimeType: 'image/png', buffer: png });
    await upload.getByRole('button', { name: /Upload$/ }).click();

    // No reader in the test server: the person fills it in (it would be filled in by the reader otherwise).
    const review = seller.getByRole('dialog', { name: /Is this right\?|What is this document\?/ });
    await expect(review).toBeVisible();
    await expect(review.getByRole('img', { name: 'water.png' })).toBeVisible();
    await review.getByLabel('Title').fill(title);
    await review.getByLabel('Amount').fill('320');
    await review.getByLabel('Paid to').fill('AAWSA');
    await review.getByLabel('Comes back').selectOption('monthly');
    await seller.getByRole('button', { name: /Add as paid, and the next one$/ }).click();
    await expect(flash(seller, `"${title}" is on the calendar as paid, with the next one due.`)).toBeVisible();

    await month(seller);
    const today = seller.locator('.rbc-event').filter({ hasText: title });
    await expect(today).toHaveClass(/state-done/);
    await today.click();
    await expect(seller.getByRole('link', { name: /See the receipt/ })).toBeVisible();
});

/** Today on this machine as yyyy-mm-dd (the shops' day in Addis). */
const today = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('seller: a shipment started from a day opens its form on that day', async ({ browser }) => {
    test.setTimeout(120_000);
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.goto('/calendar');

    await seller.getByRole('button', { name: /Add$/ }).click();
    await seller.getByRole('dialog', { name: 'Add to this day' }).getByRole('button', { name: /Shipment/ }).click();

    await expect(seller).toHaveURL(new RegExp(`/shipments\\?.*new=1.*date=${today()}`));
    await expect(seller.locator('input[type="date"]').first()).toHaveValue(today());
});

test('stock keeper: a transfer started from a day is raised with that planned day', async ({ browser }) => {
    test.setTimeout(120_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await keeper.goto('/calendar');

    await keeper.getByRole('button', { name: /Add$/ }).click();
    await keeper.getByRole('dialog', { name: 'Add to this day' }).getByRole('button', { name: /Transfer/ }).click();

    await expect(keeper).toHaveURL(/\/transfers\?.*new=1/);
    const sheet = keeper.getByRole('dialog', { name: 'Raise a transfer' });
    await expect(sheet.getByLabel('Planned for (optional)')).toHaveValue(today());
});

test('phone: the top of the calendar keeps the dates on screen', async ({ browser }) => {
    test.setTimeout(120_000);
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.setViewportSize({ width: 360, height: 760 });
    await seller.goto('/calendar');

    // The view is a select on phones, so the range label keeps its room.
    await seller.getByLabel('View').selectOption('week');
    const label = seller.getByRole('heading', { level: 2 }).first();
    await expect(label).toBeVisible();
    expect((await label.boundingBox())?.width ?? 0).toBeGreaterThan(70);

    // Hidden kinds live in the filter menu, which Escape closes.
    await seller.getByRole('button', { name: 'Show or hide kinds of dates' }).click();
    await expect(seller.getByRole('menu')).toBeVisible();
    await seller.keyboard.press('Escape');
    await expect(seller.getByRole('menu')).toBeHidden();
    await seller.screenshot({ path: 'test-results/calendar-phone.png' });
});
