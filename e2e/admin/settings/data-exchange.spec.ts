import { expect, test } from '@playwright/test';
import { run } from '../../lib/flows';
import { unitsAt } from '../../lib/inspect';
import { app, closeWindows, fixture, flash, signIn } from '../../lib/support';

test.afterEach(closeWindows);

/**
 * Settings → Import / Export, the way the page lists it: a catalogue set up from files only. Categories, the option
 * names, an item (its variants are generated), barcodes, putting the item in the store (off, unpriced), prices (which
 * put it on sale) and a stock count (which changes no stock until someone approves it in Admin → Counts). Runs on the
 * throwaway copy, never uploads a picture.
 */
const tag = run.slice(-6);
const place = `${fixture.store.name} · Store Shelf`;

/** The rows of a downloaded CSV, by column name. */
function rowsOf(csv: string): Array<Record<string, string>> {
    const records: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let quoted = false;
    const text = csv.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') {
                cell += '"';
                i++;
            } else if (ch === '"') {
                quoted = false;
            } else {
                cell += ch;
            }
        } else if (ch === '"') {
            quoted = true;
        } else if (ch === ',') {
            row.push(cell);
            cell = '';
        } else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(cell);
            records.push(row);
            row = [];
            cell = '';
        } else {
            cell += ch;
        }
    }
    if (cell !== '' || row.length) {
        row.push(cell);
        records.push(row);
    }
    const [header, ...body] = records;

    return body.map((r) => Object.fromEntries(header.map((name, index) => [name, r[index] ?? ''])));
}

test('a catalogue goes from files to on sale and in stock, from the Import / Export page', async ({ browser }) => {
    test.setTimeout(300_000); // the first page load can wait for Vite to compile it
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const download = async (key: string) => rowsOf(await (await admin.request.get(app('admin', `/data/${key}/export.csv`))).text());

    /** Opens a step's import, checks the file (saving nothing), looks for `sees`, then applies it. */
    const importFile = async (key: string, csv: string, applied: RegExp, sees?: RegExp) => {
        await admin.getByTestId(`step-${key}`).click();
        await admin.getByTestId('csv-input').fill(csv);
        await admin.getByRole('button', { name: 'Check file' }).click();
        await expect(admin.getByText(/to add, \d+ to change/)).toBeVisible();
        if (sees) await expect(admin.getByText(sees).first()).toBeVisible();
        await admin.getByRole('button', { name: 'Apply' }).click();
        await expect(admin.getByRole('dialog')).toBeHidden();
        await expect(flash(admin, applied)).toBeVisible();
    };

    const bear = `E2E Bear ${tag}`;
    const toys = `E2E Toys ${tag}`;
    const plush = `E2E Plush ${tag}`;
    const [pink, grey, small, unit, box] = [`E2E Pink ${tag}`, `E2E Grey ${tag}`, `E2E Small ${tag}`, `E2E Unit ${tag}`, `E2E Box ${tag}`];

    await admin.goto(app('admin', '/data'));
    await expect(admin.getByRole('heading', { name: 'Import / Export' })).toBeVisible({ timeout: 120_000 });
    await expect(admin.getByText('Setting up a catalogue')).toBeVisible();

    await test.step('categories and the names an item is made from', async () => {
        await importFile('categories', `path\n${toys} > ${plush}`, /2 added/);
        await importFile('item_colors', `name\n${pink}\n${grey}`, /2 added/);
        await importFile('item_sizes', `name\n${small}`, /1 added/);
        await importFile('item_packaging_types', `name\n${unit}\n${box}`, /2 added/);
    });

    await test.step('an item whose variants are generated from its options', async () => {
        const csv = `product_name,category_path,status,colors,sizes,packaging\n${bear},${toys} > ${plush},active,${pink}; ${grey},${small},${unit}:1; ${box}:6`;
        await importFile('items', csv, /1 added/, /\+4 variants/);
    });

    const item = (await download('items')).find((row) => row.product_name === bear);
    expect(item, 'the item is in the download').toBeTruthy();
    expect(item!.variants).toBe('4');
    const variants = (await download('item_variants')).filter((row) => row.item_id === item!.id);
    expect(variants).toHaveLength(4);

    await test.step('barcodes: the shop generates them', async () => {
        const csv = `sku,barcode\n${variants.map((v) => `${v.sku},AUTO`).join('\n')}`;
        await importFile('item_variants', csv, /4 changed/);
        const coded = (await download('item_variants')).filter((row) => row.item_id === item!.id);
        expect(coded.every((row) => /^2\d{12}$/.test(row.barcode))).toBe(true);
    });

    await test.step('put in the store: switched off, no price', async () => {
        await admin.getByTestId('step-deploy').click();
        await admin.getByRole('combobox', { name: 'Store' }).click();
        await admin.getByRole('option', { name: fixture.store.name, exact: true }).click();
        await admin.getByLabel(/Only the items in a file/).check();
        await admin.getByTestId('csv-input').fill(`item_id\n${item!.id}`);
        await admin.getByRole('button', { name: 'Check', exact: true }).click();
        await expect(admin.getByText(/4 store variants will be created/)).toBeVisible();
        await admin.getByRole('button', { name: 'Apply' }).click();
        await expect(flash(admin, /1 items put in/)).toBeVisible();

        const stored = (await download('store_prices')).filter((row) => row.item === bear);
        expect(stored).toHaveLength(4);
        expect(stored.every((row) => row.on_sale === 'no' && row.price === '')).toBe(true);
    });

    await test.step('prices put the variants on sale', async () => {
        const csv = `store,sku,price\n${variants.map((v) => `${fixture.store.name},${v.sku},${v.packaging === box ? 500 : 100}`).join('\n')}`;
        await importFile('store_prices', csv, /4 changed/, /4 variants go ON SALE with this file/);

        const priced = (await download('store_prices')).filter((row) => row.item === bear);
        expect(priced.every((row) => row.on_sale === 'yes')).toBe(true);
        expect(priced.map((row) => Number(row.price)).sort((a, b) => a - b)).toEqual([100, 100, 500, 500]);
    });

    await test.step('a stock count changes no stock until it is approved', async () => {
        const csv = `location,sku,unit,counted\n${variants.map((v) => `"${place}",${v.sku},${v.packaging},10`).join('\n')}`;
        await importFile('stock_counts', csv, /1 added/, /Nothing changes in stock yet/);
        for (const v of variants) expect(unitsAt(Number(v.variant_id), fixture.locations.shelf)).toBe(0);

        await admin.goto(app('admin', '/inventory/counts'));
        const card = admin.locator('[data-testid^="count-"]').filter({ hasText: bear });
        await expect(card).toHaveCount(1);
        const reference = ((await card.getAttribute('data-testid')) ?? '').replace('count-', '');
        await card.getByRole('button', { name: /Approve and book \d+ differences?/ }).click();
        await admin.getByRole('button', { name: 'Yes, approve' }).click();
        await expect(flash(admin, `${reference} approved and its differences booked.`)).toBeVisible();

        for (const v of variants) expect(unitsAt(Number(v.variant_id), fixture.locations.shelf)).toBe(10);
    });

    await test.step('the item is nearly ready on its own page', async () => {
        await admin.goto(app('admin', `/items/${item!.id}/setup`));
        const percent = Number((await admin.getByTestId('ready-percent').innerText()).replace('%', ''));
        expect(percent).toBeGreaterThan(60);
    });
});

test('a wrong line is named, nothing can be applied, and nothing is saved', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await admin.goto(app('admin', '/data'));

    await admin.getByTestId('step-items').click();
    await admin.getByTestId('csv-input').fill(`product_name,category_path,colors\nE2E Ghost ${tag},Nowhere > Land,Colour That Does Not Exist\nE2E Ghost2 ${tag},,`);
    await admin.getByRole('button', { name: 'Check file' }).click();

    await expect(admin.getByText(/Line 2: unknown category 'Nowhere > Land'/)).toBeVisible();
    await expect(admin.getByText(/Line 2: unknown colour 'Colour That Does Not Exist'/)).toBeVisible();
    await expect(admin.getByText(/Line 3: category_path is required for a new item/)).toBeVisible();
    await expect(admin.getByRole('button', { name: 'Apply' })).toBeDisabled();

    // an edited file must be checked again before it can be applied
    await admin.getByTestId('csv-input').fill('product_name,category_path\nE2E Ghost 3,');
    await expect(admin.getByRole('button', { name: 'Apply' })).toBeDisabled();
    await admin.getByRole('button', { name: 'Close' }).click();

    const items = rowsOf(await (await admin.request.get(app('admin', '/data/items/export.csv'))).text());
    expect(items.some((row) => row.product_name.startsWith('E2E Ghost'))).toBe(false);
});

test('everything downloads as one zip, and only a global admin may open the page', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    const zip = await admin.request.get(app('admin', '/data/everything.zip'));
    expect(zip.ok()).toBe(true);
    expect(zip.headers()['content-type']).toContain('zip');
    expect((await zip.body()).length).toBeGreaterThan(1000);

    const storeAdmin = await signIn(browser, 'admin', fixture.people.storeAdmin.email);
    const refused = await storeAdmin.goto(app('admin', '/data'));
    expect(refused?.status()).toBe(403);
});
