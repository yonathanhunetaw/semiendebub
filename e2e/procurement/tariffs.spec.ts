import { expect, test } from '@playwright/test';
import { csvFile } from '../lib/files';
import { run } from '../lib/flows';
import { closeWindows, fixture, flash, signIn } from '../lib/support';

test.afterEach(closeWindows);

/**
 * Tariffs from a CSV file chosen in Procurement → Tariffs → Paste CSV: the file fills the box, a file with one
 * wrong line saves nothing and names the line, a good file adds every HS code.
 */
test('tariffs imported from a CSV file: all or nothing', async ({ browser }) => {
    const buyer = await signIn(browser, 'procurement', fixture.people.procurement.email);
    const first = `98${run.slice(-6)}`;
    const second = `97${run.slice(-6)}`;
    const header = 'hs_code,description,duty,excise,vat,surtax,withholding,other';
    const table = buyer.locator('table');

    const importFile = async (name: string, text: string) => {
        await buyer.getByRole('button', { name: 'Paste CSV' }).click();
        const sheet = buyer.getByRole('dialog');
        await sheet.locator('input[type="file"]').setInputFiles(csvFile(name, text));
        await expect(sheet.locator('textarea')).toHaveValue(text);
        await sheet.getByRole('button', { name: 'Import', exact: true }).click();
    };

    await buyer.goto('/tariffs');

    await test.step('a wrong line: nothing is saved and the line is named', async () => {
        await importFile('tariffs-bad.csv', `${header}\n${first},E2E good line,20,0,15,0,3,0\n${second},E2E bad line,twenty,0,15,0,3,0`);
        await expect(flash(buyer, /Nothing imported\. Fix these lines first: Line 3/)).toBeVisible();
        await expect(table.getByText(first, { exact: true })).toHaveCount(0);
    });

    await test.step('a good file adds every code', async () => {
        await importFile('tariffs.csv', `${header}\n${first},E2E flash memory,30,0,15,10,3,0\n${second},E2E cables,20,0,15,0,3,0`);
        await expect(flash(buyer, '2 HS codes imported.')).toBeVisible();
        await expect(table.getByText(first, { exact: true })).toBeVisible();
        await expect(table.getByText('E2E cables')).toBeVisible();
    });
});
