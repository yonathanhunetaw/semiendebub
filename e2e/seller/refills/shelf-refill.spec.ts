import { expect, test } from '@playwright/test';
import { itemStockOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';

/**
 * A shelf manager asks for a bin to be topped up. What the floor can cover becomes a floor → shelf
 * task on the stock keeper's shelving list, with no approval; the keeper carries it across.
 * The fixture leaves room for exactly 5 more pieces in the bin; amounts here are pieces.
 */
const item = fixture.items[1];
const { shelf, floor } = fixture.locations;
const at = () => {
    const stock = itemStockOf(item.item_id);

    return { shelf: stock[String(shelf)] ?? 0, floor: stock[String(floor)] ?? 0 };
};

test('the manager requests a refill; the floor covers it and the keeper shelves 5', async ({ browser }) => {
    const before = at();
    const manager = await signIn(browser, 'seller', fixture.manager.email);

    await test.step('the manager opens the bin on the Store Shelf and requests a refill', async () => {
        await manager.goto(app('seller', `/locations/${shelf}`));
        await manager.getByRole('button', { name: new RegExp(`: ${item.name},`) }).first().click();
        await manager.getByRole('button', { name: /Request refill/ }).click();
        await expect(manager.getByRole('button', { name: new RegExp(`: ${item.name},.*refill on its way`) }).first()).toBeVisible();
    });

    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await test.step('the keeper finds it on the shelving list and shelves it', async () => {
        await keeper.goto(app('stockkeeper', '/shelving'));
        // This request's task: 5 pieces, which the engine sends as 1 carton. hasText matches the
        // text with no gaps between elements ("Crit low1 CartonTRF-…"), so no word boundaries.
        const task = keeper.locator('li').filter({ hasText: item.name }).filter({ hasText: /(^|\D)(1\s*Carton(?!s)|5\s*Pieces)/ }).filter({ has: keeper.getByRole('button', { name: 'Shelved' }) }).last();
        await task.getByRole('button', { name: 'Shelved' }).click();
        await expect.poll(() => at().shelf).toBe(before.shelf + 5);
        expect(at().floor).toBe(before.floor - 5);
    });
});
