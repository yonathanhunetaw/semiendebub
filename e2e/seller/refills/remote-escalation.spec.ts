import { expect, test } from '@playwright/test';
import { stockOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';
import { claim, handOver, handToCourier, receive } from '../../lib/transfers';

/**
 * A bin the store floor cannot fill goes up the refill route to the Remote Hub:
 *
 *   stock keeper    raises the refill for the empty bin      (the floor has none: a Remote Hub suggestion)
 *   store manager   adds it to the Remote Hub list           (that is the approval)
 *   stock keeper    accepts it at the hub                    (a Remote Hub → store floor transfer)
 *   courier         carries it; the keeper receives it       (it lands, and goes on towards the shelf)
 *   stock keeper    shelves it                               (the bin holds 2)
 *
 * The fixture's refill item: none on the shelf or floor, at least 5 in the Remote Hub, a bin of 2.
 */
const item = fixture.refillItem;
const { shelf, floor, remoteHub, transit } = fixture.locations;
const at = () => {
    const all = stockOf(item.variant);
    const of = (id: number) => all[String(id)] ?? 0;

    return { shelf: of(shelf), floor: of(floor), remote: of(remoteHub), transit: of(transit) };
};

test('a bin the floor cannot fill: manager sends it to the Remote Hub list, it travels and is shelved', async ({ browser }) => {
    test.setTimeout(240_000);
    const { remote } = at();
    expect(at()).toEqual({ shelf: 0, floor: 0, remote, transit: 0 });
    expect(remote).toBeGreaterThanOrEqual(5);

    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    await test.step('the keeper raises a refill for the empty bin', async () => {
        await keeper.goto(app('stockkeeper', '/shelving'));
        const need = keeper.locator('li').filter({ hasText: item.name }).filter({ has: keeper.getByRole('button', { name: 'Raise refill' }) });
        await need.getByRole('button', { name: 'Raise refill' }).click();
        await expect(keeper.getByText(/from the Remote Hub/).first()).toBeVisible();
    });

    const manager = await signIn(browser, 'seller', fixture.manager.email);
    let transfer = '';
    await test.step('the manager adds the suggestion to the Remote Hub list', async () => {
        await manager.goto(app('seller', '/refills'));
        const card = manager.locator('li').filter({ hasText: item.name }).filter({ has: manager.getByRole('button', { name: 'Add to Remote Hub list' }) });
        await card.getByRole('button', { name: 'Add to Remote Hub list' }).click();
        await expect(manager.getByText(/is on the Remote Hub list\./)).toBeVisible();
        await manager.getByRole('button', { name: /^Remote Hub list/ }).click();
        await expect(manager.locator('li').filter({ hasText: item.name }).getByText('Hub to accept')).toBeVisible();
    });

    await test.step('the keeper accepts it at the hub: a transfer to the store floor is raised', async () => {
        await keeper.goto(app('stockkeeper', '/shelving'));
        const row = keeper.locator('li').filter({ hasText: item.name }).filter({ has: keeper.getByRole('button', { name: 'Accept' }) });
        await row.getByRole('button', { name: 'Accept' }).click();
        await expect(row).toHaveCount(0);

        await manager.goto(app('seller', '/refills'));
        await manager.getByRole('button', { name: /^On its way/ }).click();
        const moving = manager.locator('li').filter({ hasText: item.name });
        await expect(moving.getByText('From Remote Hub')).toBeVisible();
        transfer = (await moving.innerText()).match(/TRF-[A-Z0-9]+-[A-Z0-9]+/)![0];
    });

    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await test.step('the courier carries it and the keeper receives it on the floor', async () => {
        await claim(courier, transfer);
        await handToCourier(keeper, transfer);
        expect(at()).toEqual({ shelf: 0, floor: 0, remote: remote - 2, transit: 2 });
        await handOver(courier, transfer);
        await receive(keeper, transfer, { sent: 2 });
        await expect.poll(() => at()).toEqual({ shelf: 0, floor: 2, remote: remote - 2, transit: 0 });
    });

    await test.step('what landed goes on the shelving list; the keeper shelves it', async () => {
        await keeper.goto(app('stockkeeper', '/shelving'));
        const task = keeper.locator('li').filter({ hasText: item.name }).filter({ has: keeper.getByRole('button', { name: 'Shelved' }) });
        await task.getByRole('button', { name: 'Shelved' }).click();
        await expect.poll(() => at()).toEqual({ shelf: 2, floor: 0, remote: remote - 2, transit: 0 });

        await manager.goto(app('seller', '/refills'));
        await manager.getByRole('button', { name: /^Closed/ }).click();
        await expect(manager.locator('li').filter({ hasText: item.name }).getByText('Done').first()).toBeVisible();
    });
});
