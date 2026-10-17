import { expect, test } from '@playwright/test';
import { app, fixture, signIn, closeWindows } from '../lib/support';
import { raiseTransfer } from '../lib/transfers';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * Shelving: Store Floor → Store Shelf, on the dev database (make walkthrough). Same site, so no
 * courier: Demo Keeper sends it and receives it. Only an item with a bin on the shelf may go
 * there; the Agenda has one.
 */
const quantity = 2;

test(`shelving: ${quantity} from the store floor onto the shelf, no courier`, async ({ browser }) => {
    const goods = fixture.remoteVariant;
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);

    const reference = await test.step(`1. the keeper raises ${quantity} × ${goods.sku}, Store Floor → Store Shelf`, async () => {
        const ref = await raiseTransfer(keeper, /Store Floor/, /Store Shelf/, quantity);
        expect(ref, 'refused: the item has no bin on the shelf, or the bin is full').toBeTruthy();

        return ref!;
    });

    const item = () => keeper.locator('li').filter({ hasText: reference });
    await test.step('2. no courier: the keeper sends it and receives it on the shelf', async () => {
        await expect(item()).not.toContainText('courier');
        await item().getByRole('button', { name: 'Send' }).click();
        await item().getByRole('button', { name: 'Receive' }).click();
        const sheet = keeper.getByRole('heading', { name: `Receive ${reference}` }).locator('xpath=ancestor::*[.//button[@type="submit"]][1]');
        await expect(sheet.locator('input[type="number"]').first()).toHaveValue(String(quantity));
        await sheet.getByRole('button', { name: 'Receive', exact: true }).click();
        await expect(item()).toContainText('Completed');
    });

    console.log(`
  Walkthrough done: shelving ${reference}, ${quantity} × ${goods.sku} from the floor onto the shelf of ${fixture.store.name}.
  Where to look (password in e2e/.fixture/demo.json):
    Keeper   ${fixture.keeper.email}    ${app('stockkeeper', '/transfers')}   ${app('stockkeeper', '/shelving')}
    Manager  ${fixture.manager.email}    ${app('seller', `/locations/${fixture.locations.shelf}`)}   the shelf and its bins
`);
});
