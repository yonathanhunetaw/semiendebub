import { expect, type Page } from '@playwright/test';
import { app, fixture } from './support';

/**
 * Procurement steps the specs share: a supplier, and a purchase order raised
 * with one line of the Remote Hub variant and submitted for approval.
 */
const sku = fixture.remoteVariant.sku;

export async function addSupplier(page: Page, name: string): Promise<void> {
    await page.goto(app('procurement', '/suppliers/create'));
    await page.getByLabel('Name', { exact: true }).fill(name);
    await page.getByLabel('Country').fill('China');
    await page.getByRole('combobox', { name: /^Invoices in/ }).selectOption('USD');
    await page.getByRole('button', { name: 'Add supplier' }).click();
    await expect(page.getByText(`${name} added.`)).toBeVisible();
}

/**
 * Raise a draft of `quantity` × `price` USD at 125 ETB, submit it; returns its reference.
 * Terms default to the supplier's (immediate); `installments` keeps the form's
 * starting schedule: 30% deposit on order, 70% on shipping.
 */
export async function raiseAndSubmit(page: Page, supplier: string, quantity: number, price: number, terms?: 'installments'): Promise<string> {
    await page.goto(app('procurement', '/purchase-orders/create'));
    await page.getByRole('combobox', { name: /^Supplier/ }).selectOption({ label: `${supplier} (China)` });
    await page.getByLabel('1 USD = ? ETB').fill('125');
    await page.getByLabel('Find a SKU to add').fill(sku);
    await page.getByRole('button', { name: new RegExp(sku) }).first().click();
    await page.getByLabel(/^Qty/).fill(String(quantity));
    await page.getByLabel(/^Unit price/).fill(String(price));
    if (terms) await page.getByRole('combobox', { name: /^Payment terms/ }).selectOption(terms);
    await page.getByRole('button', { name: 'Save draft' }).click();

    await expect(page.getByText(/saved as a draft/)).toBeVisible();
    const reference = (await page.getByRole('heading', { level: 1 }).textContent())!.trim();
    expect(reference).toMatch(/^PO-\d{4}-\d{4}$/);

    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await expect(page.getByText('Awaiting approval').first()).toBeVisible();

    return reference;
}

