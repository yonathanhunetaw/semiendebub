import { expect, test, type Page } from '@playwright/test';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Dev rides on top of a global admin: only that person sees the hidden (demo) users and anyone holding Dev, in
 * the Users list, the Sessions page, the Apps menu and the pickers. Other global admins do not.
 */
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const { people } = fixture;

const usersListed = async (page: Page) => {
    await page.goto(app('admin', '/users'));
    await expect(page.getByRole('row').nth(1)).toBeVisible();

    return page.locator('tbody').innerText();
};

test('a global admin without Dev does not see the demo user or the dev admin; the dev admin sees everyone', async ({ browser }) => {
    const plain = await signIn(browser, 'admin', people.admin.email);
    const listed = await usersListed(plain);
    expect(listed).toContain(fixture.seller.name);
    expect(listed).not.toContain(people.demoSeller.name);
    expect(listed).not.toContain(people.devAdmin.name);

    const dev = await signIn(browser, 'admin', people.devAdmin.email);
    const all = await usersListed(dev);
    expect(all).toContain(people.demoSeller.name);
    expect(all).toContain(people.devAdmin.name);
    expect(all).toContain(people.admin.name);
});

test('a hidden user is a 404 for a global admin without Dev, and opens for the dev admin', async ({ browser }) => {
    const plain = await signIn(browser, 'admin', people.admin.email);
    const response = await plain.goto(app('admin', `/users/${people.demoSeller.id}`));
    expect(response?.status()).toBe(404);

    const dev = await signIn(browser, 'admin', people.devAdmin.email);
    const opened = await dev.goto(app('admin', `/users/${people.demoSeller.id}`));
    expect(opened?.status()).toBe(200);
});

test('Dev is only offered, with the Hidden tick, to the dev layer and only on a global admin', async ({ browser }) => {
    // Without the dev layer neither shows.
    const plain = await signIn(browser, 'admin', people.admin.email);
    await plain.goto(app('admin', '/users/create'));
    await plain.getByLabel('Main role', { exact: true }).click();
    await plain.getByRole('option', { name: 'admin', exact: true }).click();
    await plain.getByRole('checkbox', { name: /Global admin/ }).check();
    await expect(plain.getByRole('checkbox', { name: 'dev', exact: true })).toHaveCount(0);
    await expect(plain.getByRole('checkbox', { name: /^Hidden/ })).toHaveCount(0);

    // With it: Hidden always, Dev only while the admin is global.
    const dev = await signIn(browser, 'admin', people.devAdmin.email);
    await dev.goto(app('admin', '/users/create'));
    await expect(dev.getByRole('checkbox', { name: /^Hidden/ })).toBeVisible();
    await dev.getByLabel('Main role', { exact: true }).click();
    await dev.getByRole('option', { name: 'admin', exact: true }).click();
    await dev.getByRole('checkbox', { name: /Global admin/ }).check();
    await expect(dev.getByRole('checkbox', { name: 'dev', exact: true })).toBeVisible();
    await dev.getByRole('checkbox', { name: /Global admin/ }).uncheck();
    await expect(dev.getByRole('checkbox', { name: 'dev', exact: true })).toHaveCount(0);
});

test('the Apps menu and the sessions page leave the demo user out for a plain global admin', async ({ browser }) => {
    // The demo user signs in somewhere, so there is a session to hide.
    const demo = await signIn(browser, 'seller', people.demoSeller.email);
    await demo.goto(app('seller', '/dashboard'));

    const plain = await signIn(browser, 'admin', people.admin.email);
    await plain.goto(app('admin', '/sessions'));
    await expect(plain.locator('body')).toContainText(people.admin.name);
    await expect(plain.locator('body')).not.toContainText(people.demoSeller.name);

    const dev = await signIn(browser, 'admin', people.devAdmin.email);
    await dev.goto(app('admin', '/sessions'));
    await expect(dev.locator('body')).toContainText(people.demoSeller.name);

    // Apps menu: Seller > people.
    for (const [page, expected] of [[plain, false], [dev, true]] as const) {
        await page.goto(app('admin', '/dashboard'));
        await page.getByRole('button', { name: 'Apps' }).first().click();
        await page.getByRole('button', { name: 'Seller', exact: true }).click();
        const listed = await page.getByRole('presentation').innerText();
        expect(listed.includes(people.demoSeller.name)).toBe(expected);
    }
});
