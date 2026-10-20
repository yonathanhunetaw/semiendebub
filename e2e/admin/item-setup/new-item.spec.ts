import { expect, test } from '@playwright/test';
import { run } from '../../lib/flows';
import { app, closeWindows, fixture, signIn } from '../../lib/support';

test.afterEach(closeWindows);

/**
 * An item made from nothing on the one page, on the throwaway copy: basics, options → variants, barcodes, deploy,
 * a real price (which puts the variants on sale), a seller price, a shelf bin, a floor level, a refill route and a
 * count approved right there. It never uploads a picture (the picture is the one part of the score it leaves).
 */
test('a new item goes from nothing to nearly fully ready without leaving the page', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const percent = async () => Number((await admin.getByTestId('ready-percent').innerText()).replace('%', ''));
    const toStore = () => admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();
    const name = `E2E Notebook ${run.slice(-6)}`;

    await test.step('create it from its basics', async () => {
        await admin.goto(app('admin', '/items/create'));
        await admin.getByLabel('Item name').fill(name);
        const category = admin.getByRole('combobox', { name: 'Category', exact: true });
        await category.click();
        await admin.getByRole('option').first().click();
        await admin.getByRole('button', { name: 'Create item' }).click();
        await expect(admin).toHaveURL(/\/items\/\d+\/setup$/);
    });
    const start = await percent();

    await test.step('options make two variants', async () => {
        await admin.getByRole('combobox', { name: 'Colours' }).fill('E2E Blue');
        await admin.keyboard.press('Enter');
        await admin.getByRole('button', { name: 'Add packaging' }).click();
        await admin.getByRole('combobox', { name: 'Packaging type 1' }).fill('Piece');
        await admin.getByLabel('Pieces in packaging 1').fill('1');
        await admin.getByRole('button', { name: 'Add packaging' }).click();
        await admin.getByRole('combobox', { name: 'Packaging type 2' }).fill('Packet');
        await admin.getByLabel('Pieces in packaging 2').fill('12');
        await admin.getByRole('button', { name: 'Apply options' }).click();
        await expect(admin.getByRole('textbox', { name: /^Barcode / })).toHaveCount(2);
    });

    await test.step('a barcode typed and one generated', async () => {
        const fields = admin.getByRole('textbox', { name: /^Barcode / });
        await fields.first().fill(`E2E-${run.slice(-6)}`);
        await admin.getByRole('button', { name: 'Save barcodes' }).click();
        await expect(admin.getByText('Barcodes saved.').first()).toBeVisible();
        await admin.getByRole('button', { name: /^Generate barcode/ }).last().click();
        await expect(fields.last()).toHaveValue(/^2\d{12}$/);
    });

    await test.step('deploy to the store: switched off and unpriced until a price is saved', async () => {
        const row = admin.getByText(fixture.store.name, { exact: true }).first().locator('xpath=ancestor::div[.//button[contains(., "Deploy")]][1]');
        await row.getByRole('button', { name: 'Deploy to this store' }).click();
        await expect(admin.getByText(/deployed to/).first()).toBeVisible();
        await toStore();
        await expect(admin.getByRole('switch', { name: /^On sale / }).first()).toBeDisabled();
    });

    await test.step('real prices put the variants on sale', async () => {
        const prices = admin.getByRole('spinbutton', { name: /^Price / });
        await prices.nth(0).fill('45');
        await prices.nth(1).fill('480');
        await admin.getByRole('button', { name: 'Save prices' }).click();
        await expect(admin.getByText(new RegExp(`Prices saved for ${fixture.store.name}`)).first()).toBeVisible();
        await expect(admin.getByRole('switch', { name: /^On sale / }).first()).toBeChecked();
    });

    await test.step('a seller price', async () => {
        await admin.getByRole('combobox', { name: 'Seller' }).click();
        await admin.getByRole('option', { name: fixture.seller.name, exact: true }).click();
        await admin.getByRole('button', { name: 'Add seller price' }).click();
        await admin.getByRole('spinbutton', { name: new RegExp(`^${fixture.seller.name} price `) }).first().fill('44');
        await admin.getByRole('button', { name: 'Save seller prices' }).click();
        await expect(admin.getByText(/business prices saved/).first()).toBeVisible();
    });

    await test.step('shelf bin, floor level and refill route', async () => {
        await admin.getByLabel('Store Shelf max').fill('24');
        await admin.getByLabel('Store Shelf refill').fill('8');
        await admin.getByLabel('Store Shelf critical').fill('2');
        await admin.getByRole('button', { name: 'Save limits' }).first().click();
        await expect(admin.getByText(/limits at Store Shelf saved/).first()).toBeVisible();

        await admin.getByLabel('Store Floor max').fill('200');
        await admin.getByLabel('Store Floor refill').fill('80');
        await admin.getByLabel('Store Floor critical').fill('20');
        await admin.getByRole('button', { name: 'Save limits' }).nth(1).click();
        await expect(admin.getByText(/limits at Store Floor saved/).first()).toBeVisible();

        await admin.getByRole('checkbox', { name: 'A shipment from the main warehouse' }).uncheck();
        await admin.getByRole('button', { name: 'Save route' }).click();
        await expect(admin.getByText(/refill route for .* saved/).first()).toBeVisible();
    });

    await test.step('count the floor and approve the count on the page', async () => {
        const counted = admin.getByRole('spinbutton', { name: /^Counted Store Floor / });
        await counted.nth(0).fill('24');
        await counted.nth(1).fill('6');
        await admin.getByRole('button', { name: 'Save count at Store Floor' }).click();
        await expect(admin.getByText(/waits for approval/).first()).toBeVisible();
        await admin.getByRole('button', { name: 'Approve and book it' }).first().click();
        await expect(admin.getByText(/approved: the stock now matches the count/).first()).toBeVisible();
    });

    const end = await percent();
    expect(end).toBeGreaterThan(start);
    // Everything required is done but the picture: 100% would be one picture away.
    expect(end).toBeGreaterThanOrEqual(90);
    expect(end).toBeLessThan(100);

    await test.step('the list knows how ready it is', async () => {
        await admin.goto(app('admin', `/items?q=${encodeURIComponent(name)}`));
        // The badge's text carries its icon's name too, so match the figure inside it.
        await expect(admin.getByText(new RegExp(`${end}%`)).first()).toBeVisible();
    });
});
