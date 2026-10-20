import { expect, test } from '@playwright/test';
import { run } from '../lib/flows';
import { app, closeWindows, fixture, signIn } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * A brand-new item made from nothing on the one setup page, on the dev database (make walkthrough).
 * Demo Admin never leaves the page after the first save:
 *
 *   1. /items/create: name, category, status → Create item (lands on its setup page)
 *   2. Options: a colour and two packagings → Apply options: the variants appear
 *   3. Barcodes: one typed, one generated
 *   4. Stores: deploy to Main Store; Prices: a real price on each variant (they go on sale)
 *   5. Placement: the shelf limits
 *   The Ready percentage climbs after every save.
 */
const name = `Demo Notebook ${run.slice(-6)}`;

test('new item: basics, options, barcodes, deploy, prices and shelf, all on one page', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const percent = async () => Number((await admin.getByTestId('ready-percent').innerText()).replace('%', ''));

    await test.step('1. create the item from its basics', async () => {
        await admin.goto(app('admin', '/items/create'));
        await admin.getByLabel('Item name').fill(name);
        await admin.getByRole('textbox', { name: 'Description', exact: true }).fill('A demo notebook made on the setup page');
        const category = admin.getByRole('combobox', { name: 'Category', exact: true });
        await category.click();
        await category.fill('NoteBook A5');
        await admin.getByRole('option', { name: /NoteBook A5/ }).first().click();
        await admin.getByRole('button', { name: 'Create item' }).click();
        await expect(admin).toHaveURL(/\/items\/\d+\/setup$/);
        await expect(admin.getByText(/created\. Add its options/).first()).toBeVisible();
    });

    const start = await percent();

    await test.step('2. a colour and two packagings make two variants', async () => {
        await admin.getByRole('combobox', { name: 'Colours' }).fill('Demo Blue');
        await admin.keyboard.press('Enter');
        await admin.getByRole('button', { name: 'Add packaging' }).click();
        await admin.getByRole('combobox', { name: 'Packaging type 1' }).fill('Piece');
        await admin.getByLabel('Pieces in packaging 1').fill('1');
        await admin.getByRole('button', { name: 'Add packaging' }).click();
        await admin.getByRole('combobox', { name: 'Packaging type 2' }).fill('Packet');
        await admin.getByLabel('Pieces in packaging 2').fill('12');
        await admin.getByRole('button', { name: 'Apply options' }).click();
        await expect(admin.getByText('Variants updated.').first()).toBeVisible();
        await expect(admin.getByRole('textbox', { name: /^Barcode / })).toHaveCount(2);
    });

    await test.step('3. one barcode typed, one generated', async () => {
        const fields = admin.getByRole('textbox', { name: /^Barcode / });
        await fields.first().fill(`DEMO-${run.slice(-6)}`);
        await admin.getByRole('button', { name: 'Save barcodes' }).click();
        await expect(admin.getByText('Barcodes saved.').first()).toBeVisible();
        await admin.getByRole('button', { name: /^Generate barcode/ }).last().click();
        await expect(fields.last()).toHaveValue(/^2\d{12}$/);
    });

    await test.step('4. deploy to Main Store and put a real price on both variants', async () => {
        await admin.getByRole('button', { name: 'Deploy to this store' }).first().click();
        await expect(admin.getByText(/deployed to/).first()).toBeVisible();
        await admin.getByRole('tab', { name: new RegExp(fixture.store.name) }).click();
        const prices = admin.getByRole('spinbutton', { name: /^Price / });
        await prices.nth(0).fill('45');
        await prices.nth(1).fill('480');
        await admin.getByRole('button', { name: 'Save prices' }).click();
        await expect(admin.getByText(new RegExp(`Prices saved for ${fixture.store.name}`)).first()).toBeVisible();
    });

    await test.step('4b. a seller price and a customer price, and a business pool', async () => {
        await admin.getByRole('spinbutton', { name: /^Business pool / }).first().fill('5');
        await admin.getByRole('button', { name: 'Save prices' }).click();
        await expect(admin.getByText(new RegExp(`Prices saved for ${fixture.store.name}`)).first()).toBeVisible();

        await admin.getByRole('combobox', { name: 'Seller' }).click();
        await admin.getByRole('option', { name: fixture.seller.name }).click();
        await admin.getByRole('button', { name: 'Add seller price' }).click();
        await admin.getByRole('spinbutton', { name: new RegExp(`^${fixture.seller.name} price `) }).first().fill('44');
        await admin.getByRole('button', { name: 'Save seller prices' }).click();
        await expect(admin.getByText(/business prices saved/).first()).toBeVisible();

        await admin.getByRole('combobox', { name: 'Find a customer' }).click();
        await admin.getByRole('combobox', { name: 'Find a customer' }).fill('Demo');
        await admin.getByRole('option').first().click();
        await admin.getByRole('spinbutton', { name: /price /i }).last().fill('43');
        await admin.getByRole('button', { name: 'Save customer prices' }).click();
        await expect(admin.getByText(/prices saved \(1 variant\)/).last()).toBeVisible();
    });

    await test.step('5. the shelf limits', async () => {
        await admin.getByLabel('Store Shelf max').fill('24');
        await admin.getByLabel('Store Shelf refill').fill('8');
        await admin.getByLabel('Store Shelf critical').fill('2');
        await admin.getByRole('button', { name: 'Save limits' }).first().click();
        await expect(admin.getByText(/limits at Store Shelf saved/).first()).toBeVisible();
    });

    await test.step('6. a refill route, and a floor level', async () => {
        // The store's default is floor, Remote Hub, shipment: drop the shipment.
        await admin.getByRole('checkbox', { name: 'A shipment from the main warehouse' }).uncheck();
        await admin.getByRole('button', { name: 'Save route' }).click();
        await expect(admin.getByText(/refill route for .* saved/).first()).toBeVisible();

        await admin.getByLabel('Store Floor max').fill('200');
        await admin.getByLabel('Store Floor refill').fill('80');
        await admin.getByLabel('Store Floor critical').fill('20');
        await admin.getByRole('button', { name: 'Save limits' }).nth(1).click();
        await expect(admin.getByText(/limits at Store Floor saved/).first()).toBeVisible();
    });

    await test.step('7. count the floor, then approve the count right here', async () => {
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

    console.log(`
  Walkthrough done: "${name}" made on one page: Ready ${start}% → ${end}%.
  Where to look (password in e2e/.fixture/demo.json):
    Admin   ${fixture.people.admin.email}    ${admin.url()}
`);
});
