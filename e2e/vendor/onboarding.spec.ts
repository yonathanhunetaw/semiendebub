import { expect, test, type Browser, type Page } from '@playwright/test';
import { app, closeWindows, fixture, signIn } from '../lib/support';

/**
 * A vendor is a store (docs/plans/missing-areas-prompt.md §6). A business applies on the
 * vendor site; a global admin rejects one and approves another under Settings → Vendors;
 * the owner sets a password from the one-time link, signs in and runs their store; the
 * store has its own page on the shop at /s/{slug}, while /shop stays the default store.
 */

test.afterEach(closeWindows);

const shop = `http://duka.test:${process.env.E2E_PORT ?? '8096'}`;

interface Business {
    name: string;
    email: string;
    phone: string;
}

function business(tag: string): Business {
    const stamp = Date.now().toString();

    return {
        name: `E2E Vendor ${tag} ${stamp.slice(-6)}`,
        email: `e2e.vendor.${tag.toLowerCase()}.${stamp}@duka.test`,
        phone: `09${stamp.slice(-8)}`,
    };
}

async function apply(browser: Browser, b: Business): Promise<void> {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(app('vendor', '/'));
    await page.getByLabel('Business name').fill(b.name);
    await page.getByLabel('Your first name').fill('Hanna');
    await page.getByLabel('Last name').fill('Tesfaye');
    await page.getByLabel('Email').fill(b.email);
    await page.getByLabel('Phone').fill(b.phone);
    await page.getByLabel('City').fill('Addis Ababa');
    await page.getByLabel('What do you sell?').fill('Phones and chargers.');
    await page.getByRole('button', { name: 'Send application' }).click();
    await expect(page.getByText('Thank you. We will look at your application')).toBeVisible();
    await context.close();
}

async function vendorsPage(browser: Browser): Promise<Page> {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/vendors'));
    await expect(admin.getByText('Applications')).toBeVisible();

    return admin;
}

test('a rejected application keeps its reason and opens no store', async ({ browser }) => {
    test.setTimeout(120_000);
    const b = business('Reject');
    await apply(browser, b);

    const admin = await vendorsPage(browser);
    const row = admin.getByRole('row', { name: new RegExp(b.name) });
    await row.getByRole('button', { name: 'Reject' }).click();
    await admin.getByRole('dialog').getByLabel(/Reason/).fill('No trade licence yet');
    await admin.getByRole('dialog').getByRole('button', { name: 'Reject' }).click();

    await expect(admin.getByText(`${b.name}'s application was rejected.`).first()).toBeVisible();
    await expect(row.getByText('No trade licence yet')).toBeVisible();
    await expect(row.getByRole('button', { name: 'Approve' })).toHaveCount(0);
});

test('an approved business sets its password, runs its store, and has its own shop page', async ({ browser }) => {
    test.setTimeout(240_000);
    const b = business('Approve');
    await apply(browser, b);

    let link = '';
    await test.step('a global admin approves it and gets the owner a set-password link', async () => {
        const admin = await vendorsPage(browser);
        const row = admin.getByRole('row', { name: new RegExp(b.name) });
        admin.once('dialog', (dialog) => dialog.accept());
        await row.getByRole('button', { name: 'Approve' }).click();

        await expect(admin.getByText(`${b.name} is open.`).first()).toBeVisible();
        const shown = admin.getByText(/\/reset-password\//);
        await expect(shown).toBeVisible();
        link = (await shown.innerText()).trim();
        // The store is listed with its public address.
        await expect(admin.getByRole('row', { name: new RegExp(b.name) }).last()).toBeVisible();
    });

    await test.step('the owner sets their password from the link', async () => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(link);
        await page.locator('#password').fill(fixture.password);
        await page.locator('#password_confirmation').fill(fixture.password);
        await page.getByRole('button', { name: /reset password/i }).click();
        await expect(page).toHaveURL(/\/login/);
        await context.close();
    });

    const slug = b.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    await test.step('the owner signs in to the vendor app and sees their own store', async () => {
        const owner = await signIn(browser, 'vendor', b.email);
        await owner.goto(app('vendor', '/dashboard'));
        await expect(owner.getByRole('heading', { name: b.name })).toBeVisible();
        await expect(owner.getByText('No orders yet')).toBeVisible();

        await owner.goto(app('vendor', '/orders'));
        await expect(owner.getByText('No orders here')).toBeVisible();
        await owner.goto(app('vendor', '/catalogue'));
        await expect(owner.getByText('Nothing listed yet')).toBeVisible();

        await owner.goto(app('vendor', '/store'));
        await expect(owner.getByLabel('Address on the shop')).toHaveValue(slug);
        await owner.getByLabel('About the store').fill('Phones, chargers and cables.');
        await owner.getByRole('button', { name: 'Save' }).click();
        await expect(owner.getByText('Saved.')).toBeVisible();
    });

    await test.step('the store has its own page on the shop; /shop is still the default store', async () => {
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(`${shop}/s/${slug}`);
        await expect(page.getByText(b.name).first()).toBeVisible();

        await page.goto(`${shop}/shop`);
        await expect(page.getByText(b.name)).toHaveCount(0);

        const missing = await page.goto(`${shop}/s/no-such-store-${Date.now()}`);
        expect(missing?.status()).toBe(404);
        await context.close();
    });
});
