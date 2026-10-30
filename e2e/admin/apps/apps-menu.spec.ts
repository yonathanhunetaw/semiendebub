import { expect, test, type Page } from '@playwright/test';
import { app, fixture, signIn } from '../../lib/support';

/**
 * The Apps menu: an admin moves between apps without a second login. A window of apps, A to Z; choosing one lists
 * who to be in it ("Me" first, then people, A to Z). A global admin can be anyone but an admin; a store admin
 * only themself, and only in the apps they are ticked for. Inside an opened app a round nine-dots button
 * says who you are right now and carries the same menu.
 */
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const { people } = fixture;
const label = (page: Page) => page.getByRole('presentation').locator('button[aria-label]');

/** Opens the window and returns the app names in the order shown. */
async function openApps(page: Page): Promise<string[]> {
    await page.getByRole('button', { name: 'Apps' }).first().click();
    await expect(label(page).first()).toBeVisible();

    return label(page).evaluateAll((tiles) => tiles.map((tile) => tile.getAttribute('aria-label') ?? ''));
}

const sorted = (names: string[]) => [...names].sort((a, b) => a.localeCompare(b));

test('a global admin sees every app A to Z, then Me first and the people A to Z; hidden demo users are not offered', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', people.admin.email);
    await admin.goto(app('admin', '/dashboard'));

    const apps = await openApps(admin);
    expect(apps).toEqual(sorted(apps));
    for (const name of ['Admin', 'Delivery', 'Seller', 'StockKeeper', 'Finance']) expect(apps).toContain(name);

    // Who I am right now.
    await expect(admin.getByRole('presentation').getByText(people.admin.name, { exact: true })).toBeVisible();
    await expect(admin.getByRole('presentation').getByText(/Admin app · You/)).toBeVisible();

    await admin.getByRole('button', { name: 'Seller', exact: true }).click();
    const rows = admin.getByRole('presentation').getByRole('button').filter({ hasNotText: /^$/ });
    await expect(admin.getByRole('presentation').getByText(`Me · ${people.admin.name}`)).toBeVisible();

    // The name in each row, without the initials avatar beside it.
    const names = await admin.getByRole('presentation').locator('.MuiListItemText-primary').allInnerTexts();
    const list = names.map((text) => text.trim()).filter((text) => text.startsWith('E2E') || text.startsWith('Me ·'));
    expect(list[0]).toBe(`Me · ${people.admin.name}`);
    const others = list.slice(1);
    expect(others).toEqual(sorted(others));
    expect(others).toContain(fixture.seller.name);
    expect(others).toContain(people.dualSeller.name);
    // The demo user is hidden from a global admin without the dev layer.
    expect(others).not.toContain(people.demoSeller.name);
    await expect(rows.first()).toBeVisible();
});

test('opening as a seller signs them in with no login, the round button says who, and Back to admin returns', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', people.admin.email);
    await admin.goto(app('admin', '/dashboard'));

    await openApps(admin);
    await admin.getByRole('button', { name: 'Seller', exact: true }).click();
    await admin.getByText(fixture.seller.name, { exact: true }).click();

    await expect(admin).toHaveURL(/seller\.duka\.test:\d+\/dashboard/);
    await expect(admin.getByText(/Sign in|Log in/)).toHaveCount(0);

    // The round nine-dots button, and who I am now.
    const fab = admin.getByRole('button', { name: 'Apps' });
    await expect(fab).toBeVisible();
    await fab.click();
    await expect(admin.getByRole('presentation').getByText(fixture.seller.name, { exact: true })).toBeVisible();
    await expect(admin.getByRole('presentation').getByText(`Seller app · Opened by ${people.admin.name}`)).toBeVisible();

    // Switch again from inside, without going back: to the courier.
    await admin.getByRole('button', { name: 'Delivery', exact: true }).click();
    await admin.getByText(fixture.courier.name, { exact: true }).click();
    await expect(admin).toHaveURL(/delivery\.duka\.test:\d+\/dashboard/);

    // Back to admin: the admin's own session is intact.
    await admin.getByRole('button', { name: 'Apps' }).click();
    await admin.getByText('Back to admin').click();
    await expect(admin).toHaveURL(/admin\.duka\.test:\d+\/dashboard/);
    await expect(admin.getByText(people.admin.name).first()).toBeVisible();
});

test('"Me" in an app opens my own account there, and the window says it is me', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', people.admin.email);
    await admin.goto(app('admin', '/dashboard'));

    await openApps(admin);
    await admin.getByRole('button', { name: 'Finance', exact: true }).click();
    // Finance has nobody else to be but the finance user: Me is first.
    await admin.getByText(`Me · ${people.admin.name}`).click();

    await expect(admin).toHaveURL(/finance\.duka\.test:\d+\/dashboard/);
    await admin.getByRole('button', { name: 'Apps' }).click();
    await expect(admin.getByRole('presentation').getByText(people.admin.name, { exact: true })).toBeVisible();
    await expect(admin.getByRole('presentation').getByText('Finance app · You')).toBeVisible();
});

test('a store admin sees only the apps they are ticked for, and only themself in each', async ({ browser }) => {
    const ticked = await signIn(browser, 'admin', people.tickedStoreAdmin.email);
    await ticked.goto(app('admin', '/dashboard'));

    const apps = await openApps(ticked);
    expect(apps).toEqual(['Admin', 'Seller', 'StockKeeper']);

    // Seller has nobody else to be: choosing it opens straight away, as themself.
    await ticked.getByRole('button', { name: 'Seller', exact: true }).click();
    await expect(ticked).toHaveURL(/seller\.duka\.test:\d+\/dashboard/);
    await ticked.getByRole('button', { name: 'Apps' }).click();
    await expect(ticked.getByRole('presentation').getByText(people.tickedStoreAdmin.name, { exact: true })).toBeVisible();
    await expect(ticked.getByRole('presentation').getByText('Seller app · You')).toBeVisible();
});

test('a store admin with no ticks has nothing to open, so gets no Apps button', async ({ browser }) => {
    const plain = await signIn(browser, 'admin', people.storeAdmin.email);
    await plain.goto(app('admin', '/dashboard'));
    await expect(plain.getByText('Mezgebe Dirijit').first()).toBeVisible();

    await expect(plain.getByRole('button', { name: 'Apps' })).toHaveCount(0);
});

test('the round button never shows for staff who were not switched in', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.goto(app('seller', '/dashboard'));
    await expect(seller.getByRole('button', { name: 'Apps' })).toHaveCount(0);
});

test.describe('phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test('on a phone the Apps menu is the same floating button, and Settings has no copy of it', async ({ browser }) => {
        const admin = await signIn(browser, 'admin', people.admin.email);
        await admin.goto(app('admin', '/settings'));
        await expect(admin.getByText('Open another app, as yourself or as someone else')).toHaveCount(0);

        await admin.goto(app('admin', '/dashboard'));
        await admin.getByRole('button', { name: 'Apps' }).click();
        await expect(admin.getByRole('presentation').locator('button[aria-label="Seller"]')).toBeVisible();
    });
});
