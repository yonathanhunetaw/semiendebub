import { expect, test, type Locator, type Page } from '@playwright/test';
import { pngFile } from '../../lib/files';
import { run } from '../../lib/flows';
import { app, closeWindows, fixture, signIn } from '../../lib/support';

test.afterEach(closeWindows);

/**
 * Pictures on the item setup page, through the real file chooser: one for the item's gallery (the part of the
 * readiness score new-item.spec leaves) and one in a variant's slot, each shown, served and removed again.
 * The test server keeps the r2 disk on this Mac (R2_LOCAL, set by `deploy/dev.sh e2e`), so nothing reaches prod's bucket.
 */
test('a gallery picture and a variant photo are uploaded, shown and removed', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const percent = async () => Number((await admin.getByTestId('ready-percent').innerText()).replace('%', ''));
    const name = `E2E Mug ${run.slice(-6)}`;

    /** Clicks the button that opens the hidden file input and picks the file. */
    const choose = async (page: Page, button: Locator, file = pngFile()) => {
        const chooser = page.waitForEvent('filechooser');
        await button.click();
        await (await chooser).setFiles(file);
    };
    /** The picture is really there: served by the test server (not R2) and decoded by the browser. */
    const served = async (img: Locator) => {
        await expect(img).toBeVisible();
        expect(await img.getAttribute('src')).toContain('/storage/r2-local/');
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    };

    await test.step('an item with one variant', async () => {
        await admin.goto(app('admin', '/items/create'));
        await admin.getByLabel('Item name').fill(name);
        await admin.getByRole('combobox', { name: 'Category', exact: true }).click();
        await admin.getByRole('option').first().click();
        await admin.getByRole('button', { name: 'Create item' }).click();
        await expect(admin).toHaveURL(/\/items\/\d+\/setup$/);

        await admin.getByRole('button', { name: 'Add packaging' }).click();
        await admin.getByRole('combobox', { name: 'Packaging type 1' }).fill('Piece');
        await admin.getByLabel('Pieces in packaging 1').fill('1');
        await admin.getByRole('button', { name: 'Apply options' }).click();
        await expect(admin.getByRole('textbox', { name: /^Barcode / })).toHaveCount(1);
    });
    const start = await percent();

    await test.step('a gallery picture is saved the moment it is chosen, and counts', async () => {
        await choose(admin, admin.getByRole('button', { name: 'Add a picture' }), pngFile('mug.png'));
        await expect(admin.getByText('Picture added.').first()).toBeVisible();
        await served(admin.getByRole('img', { name: 'Item picture' }));
        await expect.poll(percent).toBeGreaterThan(start);
    });

    await test.step('it stays after a reload', async () => {
        await admin.reload();
        await served(admin.getByRole('img', { name: 'Item picture' }));
    });

    await test.step('removing it takes the score back down', async () => {
        await admin.getByRole('button', { name: /^Remove picture uploads\// }).click();
        await expect(admin.getByText('Picture removed.').first()).toBeVisible();
        await expect(admin.getByRole('img', { name: 'Item picture' })).toHaveCount(0);
        await expect.poll(percent).toBe(start);
    });

    await test.step('a photo in the variant’s first slot', async () => {
        const sku = (await admin.getByRole('textbox', { name: /^Barcode / }).getAttribute('aria-label'))!.replace(/^Barcode /, '');
        await choose(admin, admin.getByRole('button', { name: `Add picture 1 to ${sku}` }), pngFile('mug-front.png'));
        await expect(admin.getByText('Picture saved.').first()).toBeVisible();
        await served(admin.getByRole('img', { name: `${sku} picture 1` }));
        await expect(admin.getByRole('button', { name: `Add picture 1 to ${sku}` })).toHaveCount(0);

        await admin.reload();
        await served(admin.getByRole('img', { name: `${sku} picture 1` }));

        await admin.getByRole('button', { name: `Remove picture 1 of ${sku}` }).click();
        await expect(admin.getByText('Picture removed.').first()).toBeVisible();
        await expect(admin.getByRole('img', { name: `${sku} picture 1` })).toHaveCount(0);
        await expect(admin.getByRole('button', { name: `Add picture 1 to ${sku}` })).toBeVisible();
    });
});
