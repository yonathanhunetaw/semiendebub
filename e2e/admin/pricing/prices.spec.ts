import { expect, test, type Page } from '@playwright/test';
import { addFirstVariant, startCart, type CustomerSpec } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * An admin prices an item from Admin → Stores → the item → Edit price, and the seller's
 * cart follows: the business price, the individual price, one seller's price and one
 * customer's price (the ladder pinned in seller/pricing, here set through the screens).
 * The item starts with only a store price of 30 and nothing else (PrepareE2eCommand).
 */
const item = fixture.adminPriced;
const set = { business: 32, individual: 36, seller: 31, customer: 25 };
const birr = (amount: number) => `ETB ${amount.toFixed(2)}`;

const customer = (key: 'business' | 'priced'): CustomerSpec => {
    const { name, phone, tin } = fixture.customers[key];
    const [first, ...last] = name.split(' ');

    return { key, first, last: last.join(' '), phone, tin, type: 'Business' };
};

test.describe.configure({ mode: 'serial' });

test('the admin sets the business, individual, seller and customer prices', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', `/stores/${fixture.store.id}`));

    // The search runs on the server, so it finds the item on whichever page it sits.
    await admin.getByPlaceholder('Search SKU, name, or scan barcode...').fill(item.name);
    await expect(admin).toHaveURL(/search=/);
    await admin.getByRole('button', { name: new RegExp(item.name) }).first().click();

    // The sheet opens on the variant the seller's add-to-cart sheet starts on.
    const sheet = admin.locator('.MuiDrawer-paper').last();
    await expect(sheet.getByText(item.variants[0].sku)).toBeVisible();
    await sheet.getByRole('button', { name: 'Edit price' }).click();

    const editor = admin.locator('.MuiDrawer-paper').last();
    await expect(editor.getByRole('tab', { name: 'Default Price' })).toBeVisible();

    await editor.getByLabel('Default Business Price').fill(String(set.business));
    await editor.getByRole('button', { name: 'Save Default Business Price' }).click();
    await expect(group(admin, 'Business')).toContainText(`${set.business.toFixed(2)} ETB`);

    await reopen(admin);
    await admin.locator('.MuiDrawer-paper').last().getByRole('tab', { name: 'Individual', exact: true }).click();
    await admin.locator('.MuiDrawer-paper').last().getByLabel('Individual Price', { exact: true }).fill(String(set.individual));
    await admin.locator('.MuiDrawer-paper').last().getByRole('button', { name: 'Save Default Individual Price' }).click();
    await expect(group(admin, 'Individual')).toContainText(`${set.individual.toFixed(2)} ETB`);

    await reopen(admin);
    let panel = admin.locator('.MuiDrawer-paper').last();
    await panel.getByRole('tab', { name: 'Seller Price' }).click();
    await select(panel, 'Seller').click();
    await admin.getByRole('option', { name: fixture.seller.name, exact: true }).click();
    await panel.getByLabel('Business Seller Price').fill(String(set.seller));
    await panel.getByRole('button', { name: 'Save Seller Price' }).click();
    await expect(group(admin, 'Seller prices')).toContainText(fixture.seller.name);

    await reopen(admin);
    panel = admin.locator('.MuiDrawer-paper').last();
    await panel.getByRole('tab', { name: 'Customer Price' }).click();
    await select(panel, 'Customers').click();
    await admin.getByRole('option', { name: fixture.customers.priced.name }).click();
    await admin.keyboard.press('Escape');
    await panel.getByLabel('Business Customer Price').fill(String(set.customer));
    await panel.getByRole('button', { name: /^Save Business Price/ }).click();
    await expect(group(admin, 'Customer prices')).toContainText(fixture.customers.priced.name);

    // Admin → Customers → Discounts lists every customer's own price: this one has no discount.
    await admin.goto(app('admin', '/customers/discounts?status=price'));
    const row = admin.locator('tr, li, .MuiCard-root, .MuiPaper-root').filter({ hasText: fixture.customers.priced.name }).filter({ hasText: item.name }).last();
    await expect(row).toContainText('No discount');
    await expect(row).toContainText(String(set.customer));
});

/**
 * One "Prices applied" group on the item's sheet. Saving closes the editor (and its toast
 * with it), so the sheet behind is where a saved price shows.
 */
function group(admin: Page, title: string) {
    // Title → its header box → the header row → the group (PriceGroup in StoreInventory.tsx).
    const sheet = admin.locator('.MuiDrawer-paper').filter({ hasText: 'Prices applied' });

    return sheet.getByText(title, { exact: true }).locator('xpath=ancestor::div[3]');
}

/** An MUI Select by its floating label (the label is not tied to the combobox for screen readers). */
const select = (panel: ReturnType<Page['locator']>, label: string) =>
    panel.locator('.MuiFormControl-root').filter({ has: panel.page().locator('label', { hasText: new RegExp(`^${label}$`) }) }).getByRole('combobox');

/** Saving closes the editor; the item's sheet stays, so open the editor again. */
async function reopen(admin: Page): Promise<void> {
    const sheet = admin.locator('.MuiDrawer-paper').filter({ has: admin.getByRole('button', { name: 'Edit price' }) });
    await sheet.getByRole('button', { name: 'Edit price' }).click();
    await expect(admin.locator('.MuiDrawer-paper').last().getByRole('tab', { name: 'Default Price' })).toBeVisible();
}

const cases: Array<{ who: 'seller' | 'seller2'; to: CustomerSpec | null; price: number; why: string }> = [
    { who: 'seller2', to: customer('business'), price: set.business, why: 'a business pays the business price' },
    { who: 'seller2', to: null, price: set.individual, why: 'a walk-in pays the individual price' },
    { who: 'seller', to: customer('business'), price: set.seller, why: "the seller's own price" },
    { who: 'seller2', to: customer('priced'), price: set.customer, why: "the customer's own price" },
];

for (const { who, to, price, why } of cases) {
    test(`then the cart: ${birr(price)}, ${why}`, async ({ browser }) => {
        const seller = await signIn(browser, 'seller', who === 'seller' ? fixture.seller.email : fixture.people.seller2.email);
        const cartId = await startCart(seller, to);
        await addFirstVariant(seller, cartId, item.item_id);

        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await expect(seller.getByText(birr(price)).first()).toBeVisible();
    });
}
