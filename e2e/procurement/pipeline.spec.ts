import { expect, test, type Page } from '@playwright/test';
import { unitsAt } from '../lib/inspect';
import { app, fixture, flash, signIn } from '../lib/support';

/**
 * The procurement pipeline, end to end, each person in their own window
 * (docs/plans/procurement-pipeline.md, PP1–PP5):
 *
 *   a seller suggests a product; the admin marks a shop to check and sends the
 *   idea to price check; the seller writes down a price; the store manager
 *   verifies it; the admin sends it to procurement; procurement sets a rate, a
 *   route, a tariff and a supplier and takes a quote with its landed cost; the
 *   admin approves; procurement orders it, marks the idea bought and ships it
 *   in a consignment to the dry port with a freight cost; finance confirms the
 *   cost; the hub keeper counts it in at Main Hub A; procurement finalises the
 *   costs.
 */
const stamp = Date.now().toString(36);
const ideaName = `E2E flash drive ${stamp}`;
const shopName = `E2E Merkato Electronics ${stamp}`;
const routeName = `E2E Guangzhou to Modjo ${stamp}`;
const supplierName = `E2E Shenzhen Memory ${stamp}`;
const hsCode = `9${Date.now().toString().slice(-7)}`;
const units = 10;

const card = (page: Page, text: string) => page.locator('section').filter({ hasText: text }).first();
const dialog = (page: Page) => page.getByRole('dialog');
/** The control under an SkField whose heading is exactly `label` (a select's name also holds its options). */
const field = (page: Page, label: string) =>
    page.locator('label').filter({ has: page.locator('span', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).locator('select, input').first();

test('an idea goes from a seller\'s suggestion to stock in the hub with its cost written', async ({ browser }) => {
    test.setTimeout(1_200_000);
    const { people } = fixture;
    const storeId = fixture.store.id;
    const hub = fixture.locations.hub;
    const variant = fixture.hubVariant;
    const hubBefore = unitsAt(variant.id, hub);

    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    const admin = await signIn(browser, 'admin', people.admin.email);
    const buyer = await signIn(browser, 'procurement', people.procurement.email);
    const buyer2 = await signIn(browser, 'procurement', people.procurement2.email);
    const finance = await signIn(browser, 'finance', people.finance.email);
    const hubKeeper = await signIn(browser, 'stockkeeper', people.hubKeeper.email);

    await test.step('the seller suggests a product', async () => {
        await seller.goto(app('seller', '/ideas'));
        await seller.getByRole('button', { name: /Suggest$/ }).first().click();
        await dialog(seller).getByLabel('What is it?').fill(ideaName);
        await dialog(seller).getByLabel('Why?').fill('Customers ask for it every week');
        await dialog(seller).getByRole('button', { name: 'Suggest' }).click();
        await expect(card(seller, ideaName)).toContainText('Suggested');
    });

    await test.step('the admin lists a shop for the store to check', async () => {
        await admin.goto(app('admin', `/shops?store=${storeId}`));
        await admin.getByRole('button', { name: 'Add a shop' }).click();
        await dialog(admin).getByLabel('Name').fill(shopName);
        await dialog(admin).getByLabel('Area').fill('Merkato');
        await dialog(admin).getByRole('button', { name: 'Save' }).click();
        await expect(flash(admin, /added/)).toBeVisible();
        await card(admin, shopName).getByRole('button', { name: 'Check', exact: true }).click();
        await expect(flash(admin, /Sellers will check/)).toBeVisible();
    });

    await test.step('the admin sends the idea to price check with the price the store would sell it for', async () => {
        await admin.goto(app('admin', `/ideas?store=${storeId}`));
        await card(admin, ideaName).getByRole('button', { name: 'Send to price check' }).click();
        await dialog(admin).getByLabel('We would sell one for (ETB)').fill('650');
        await dialog(admin).getByLabel('Shops to check').fill('1');
        await dialog(admin).getByRole('button', { name: 'Send to price check' }).click();
        await expect(card(admin, ideaName)).toContainText('Price check');
    });

    await test.step('the seller writes down what the shop charges', async () => {
        await seller.goto(app('seller', '/price-checks'));
        await seller.getByRole('link', { name: new RegExp(ideaName) }).click();
        await seller.getByLabel('Shop').selectOption({ label: shopName });
        await seller.getByLabel('Price for one piece (ETB)').fill('700');
        await seller.getByRole('button', { name: 'Write it down' }).click();
        await expect(flash(seller, /Price written down/)).toBeVisible();
        // A seller sees their own price, never the summary.
        await expect(seller.getByText('Verified prices, per piece')).toHaveCount(0);
    });

    await test.step('the store manager verifies it', async () => {
        await manager.goto(app('seller', '/price-checks'));
        await manager.getByRole('link', { name: new RegExp(ideaName) }).click();
        await manager.getByRole('button', { name: 'Verify' }).click();
        await expect(flash(manager, /Price verified/)).toBeVisible();
        await expect(manager.getByText('Verified prices, per piece')).toBeVisible();
    });

    await test.step('the admin takes the prices in and sends the idea to procurement', async () => {
        await admin.goto(app('admin', `/ideas?store=${storeId}`));
        await card(admin, ideaName).getByRole('button', { name: 'Prices are in' }).click();
        await expect(card(admin, ideaName)).toContainText('Prices in');
        await card(admin, ideaName).getByRole('button', { name: 'Send to procurement' }).click();
        await expect(card(admin, ideaName)).toContainText('With procurement');
    });

    await test.step('procurement sets a rate, a route, a tariff and a supplier', async () => {
        await buyer.goto(app('procurement', '/costs'));
        await buyer.getByLabel('New ETB rate for USD').fill('150');
        await buyer.locator('form').filter({ has: buyer.getByLabel('New ETB rate for USD') }).getByRole('button', { name: 'Set' }).click();
        await expect(flash(buyer, /1 USD = ETB 150/)).toBeVisible();

        await buyer.getByRole('button', { name: 'Add a route' }).click();
        await dialog(buyer).getByLabel('Name').fill(routeName);
        await dialog(buyer).getByLabel(/^Sea freight/).fill('200');
        await dialog(buyer).getByLabel(/^Port & clearing/).fill('4000');
        await dialog(buyer).getByRole('button', { name: 'Save' }).click();
        await expect(flash(buyer, /added/)).toBeVisible();

        await buyer.goto(app('procurement', '/tariffs'));
        await buyer.getByRole('button', { name: /\bAdd$/ }).click();
        await dialog(buyer).getByLabel('HS code').fill(hsCode);
        await dialog(buyer).getByLabel('Customs duty %').fill('20');
        await dialog(buyer).getByLabel('VAT (claimed back) %').fill('15');
        await dialog(buyer).getByRole('button', { name: 'Save' }).click();
        await expect(flash(buyer, /added/)).toBeVisible();

        await buyer.goto(app('procurement', '/suppliers/create'));
        await buyer.getByLabel('Name').fill(supplierName);
        await buyer.getByRole('button', { name: 'Add supplier' }).click();
        await expect(flash(buyer, /added/)).toBeVisible();
    });

    await test.step('procurement takes a quote and sees what it costs on the shelf', async () => {
        await buyer.goto(app('procurement', '/ideas'));
        await card(buyer, ideaName).getByRole('link', { name: 'Quotes and cost' }).click();
        await buyer.getByRole('button', { name: 'Add a quote' }).click();
        const sheet = dialog(buyer);
        await sheet.getByLabel('Supplier').selectOption({ label: supplierName });
        await sheet.getByLabel('Currency').selectOption('USD');
        await sheet.getByLabel(/^Price a piece/).fill('2');
        await sheet.getByLabel(/^MOQ/).fill('1000');
        await sheet.getByLabel('Pieces / carton').fill('100');
        await sheet.getByLabel('CBM / carton').fill('0.05');
        await sheet.getByLabel('HS code').fill(hsCode);
        await sheet.getByLabel('Route').selectOption({ label: routeName });
        await sheet.getByRole('button', { name: 'Save and estimate' }).click();
        await expect(flash(buyer, /Quote saved/)).toBeVisible();
        // 1,000 × USD 2 × 150 = 300,000; freight 0.5 CBM × 200 × 150 = 15,000; duty 20% of CIF 315,000 = 63,000;
        // port 0.5 × 4,000 = 2,000; VAT is claimed back. 380,000 ÷ 1,000 pieces.
        await expect(buyer.getByText('Cost on the shelf, per piece').first()).toBeVisible();
        await expect(card(buyer, supplierName)).toContainText('ETB 380.00');
    });

    await test.step('the admin approves it', async () => {
        await admin.goto(app('admin', `/ideas?store=${storeId}`));
        await expect(card(admin, ideaName)).toContainText('a piece on the shelf');
        await card(admin, ideaName).getByRole('button', { name: 'Approve to buy' }).click();
        await expect(card(admin, ideaName)).toContainText('Approved');
    });

    let order = '';
    let poRef = '';
    await test.step('procurement raises the order, a colleague approves it, it is placed', async () => {
        await buyer.goto(app('procurement', '/purchase-orders/create'));
        await field(buyer, 'Supplier').selectOption({ label: supplierName });
        await field(buyer, 'Currency').selectOption('USD');
        await buyer.getByLabel(/^1 USD = \?/).fill('150');
        await buyer.getByLabel('Find a SKU to add').fill(variant.sku);
        await buyer.getByRole('button', { name: new RegExp(variant.sku) }).first().click();
        await buyer.getByLabel(/^Qty/).fill(String(units));
        await buyer.getByLabel(/^Unit price/).fill('2');
        await buyer.getByLabel('CBM (line)').fill('0.05');
        await buyer.getByRole('button', { name: 'Save draft' }).click();
        await expect(buyer).toHaveURL(/\/purchase-orders\/\d+$/);
        order = buyer.url();
        poRef = ((await buyer.locator('h1').first().textContent()) ?? '').trim();
        await buyer.getByRole('button', { name: 'Submit for approval' }).click();
        await expect(buyer.getByText(/submitted/i).first()).toBeVisible();

        await buyer2.goto(order);
        await buyer2.getByRole('button', { name: 'Approve' }).click();
        await expect(flash(buyer2, /approved/i)).toBeVisible();

        await buyer.goto(order);
        await buyer.getByRole('button', { name: 'Mark ordered' }).click();
        await dialog(buyer).getByRole('button', { name: 'Mark ordered' }).click();
        await expect(buyer.getByText(/Ordered/).first()).toBeVisible();
    });

    await test.step('procurement marks the idea bought on that order', async () => {
        await buyer.goto(app('procurement', '/ideas?tab=approved'));
        await card(buyer, ideaName).getByRole('button', { name: 'Bought on an order' }).click();
        const lines = await dialog(buyer).getByLabel('Order line').locator('option').allTextContents();
        await dialog(buyer).getByLabel('Order line').selectOption({ index: lines.findIndex((t) => t.startsWith(poRef)) });
        await dialog(buyer).getByRole('button', { name: 'Mark bought' }).click();
        await expect(flash(buyer, /is bought/)).toBeVisible();
    });

    let consignment = '';
    await test.step('the goods travel to the dry port with a freight cost', async () => {
        await buyer.goto(app('procurement', '/consignments'));
        await buyer.getByRole('button', { name: 'New consignment' }).click();
        await dialog(buyer).getByLabel('Route').selectOption({ label: routeName });
        await dialog(buyer).getByRole('button', { name: 'Start it' }).click();
        await expect(buyer).toHaveURL(/\/consignments\/\d+$/);
        consignment = buyer.url();

        await buyer.getByRole('button', { name: 'From an order' }).click();
        const lines = await dialog(buyer).getByLabel('Order line').locator('option').allTextContents();
        await dialog(buyer).getByLabel('Order line').selectOption({ index: lines.findIndex((t) => t.startsWith(poRef)) });
        await dialog(buyer).getByRole('button', { name: 'Put on' }).click();
        await expect(flash(buyer, /Put on the consignment/)).toBeVisible();

        await buyer.getByRole('button', { name: 'At the dry port' }).click();
        await dialog(buyer).getByRole('button', { name: 'Yes, move them' }).click();
        await expect(buyer.getByText(/In stock at “At the dry port”/)).toBeVisible();

        await buyer.getByRole('button', { name: 'Record a cost' }).click();
        await dialog(buyer).getByLabel('What for').selectOption('freight');
        await dialog(buyer).getByLabel('Amount').fill('300');
        await dialog(buyer).getByRole('button', { name: 'Record' }).click();
        await expect(flash(buyer, /Cost recorded/)).toBeVisible();
    });

    await test.step('finance confirms the cost', async () => {
        await finance.goto(app('finance', '/import-costs'));
        await card(finance, 'Sea freight').getByRole('button', { name: 'Confirm' }).click();
        await expect(flash(finance, /Cost confirmed/)).toBeVisible();
    });

    await test.step('the hub keeper counts it in at Main Hub A', async () => {
        await hubKeeper.goto(app('stockkeeper', '/arrivals'));
        const ref = (await buyer.locator('h1').first().textContent())?.trim() ?? '';
        await card(hubKeeper, ref).getByRole('button', { name: 'It has arrived' }).click();
        await dialog(hubKeeper).getByRole('button', { name: 'Receive' }).click();
        await expect(flash(hubKeeper, /received at/)).toBeVisible();
        await expect.poll(() => unitsAt(variant.id, hub)).toBe(hubBefore + units);
    });

    await test.step('procurement finalises the costs', async () => {
        await buyer.goto(consignment);
        await buyer.getByRole('button', { name: 'Finalise costs' }).click();
        await expect(flash(buyer, /Costs finalised/)).toBeVisible();
        await expect(buyer.getByText(/Costs finalised .*: each item's cost is written/)).toBeVisible();
        // Goods ETB 3,000 + freight 300, over 10 whole units.
        await expect(buyer.getByRole('cell', { name: 'ETB 330.00' })).toBeVisible();

        await buyer.goto(order);
        await expect(buyer.getByText(/Received/).first()).toBeVisible();
    });
});
