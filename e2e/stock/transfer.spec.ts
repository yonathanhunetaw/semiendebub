import { expect, test } from '@playwright/test';
import { stockOf, unitsAt } from '../lib/inspect';
import { app, fixture, signIn } from '../lib/support';
import { cardOf, claim, handOver, handToCourier, raiseTransfer as raise, receive } from '../lib/transfers';

/**
 * A refill from the store's Remote Hub to its floor. It leaves the site, so a courier carries it:
 *
 *   stock keeper   raises the transfer (Remote Hub → store floor)
 *   courier        claims it from the pool
 *   stock keeper   hands it to the courier          (stock leaves the Remote Hub)
 *   courier        hands it over at the store       (still the courier's)
 *   stock keeper   checks it and receives it        (stock lands)
 */
const quantity = 4;

/**
 * Shelving: store floor → Store Shelf. Same site, so no courier: the keeper sends it and receives it.
 * Only an item with a planogram bin on the shelf may go there (ShelfAssignmentGuard).
 */
test('shelving store floor → shelf: an item with a bin is sent and received by the keeper, no courier', async ({ browser }) => {
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const variant = fixture.remoteVariant.id;
    const { floor, shelf } = fixture.locations;
    const before = { floor: unitsAt(variant, floor), shelf: unitsAt(variant, shelf) };
    const reference = (await raise(keeper, /Store Floor/, /Store Shelf/, 2))!;
    expect(reference).toBeTruthy();
    const item = () => keeper.locator('li').filter({ hasText: reference });

    await expect(item()).not.toContainText('courier');
    await item().getByRole('button', { name: 'Send' }).click();
    await item().getByRole('button', { name: 'Receive' }).click();

    const sheet = keeper.getByRole('heading', { name: `Receive ${reference}` }).locator('xpath=ancestor::*[.//button[@type="submit"]][1]');
    await expect(sheet.locator('input[type="number"]').first()).toHaveValue('2');
    await sheet.getByRole('button', { name: 'Receive', exact: true }).click();

    await expect(item()).toContainText('Completed');
    await expect(item().getByRole('button')).toHaveCount(0);
    expect({ floor: unitsAt(variant, floor), shelf: unitsAt(variant, shelf) }).toEqual({ floor: before.floor - 2, shelf: before.shelf + 2 });
});

test('shelving refused: an item with no bin on the shelf cannot be sent there', async ({ browser }) => {
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const reference = await raise(keeper, /Store Floor/, /Store Shelf/, 2, fixture.items[0].name);

    expect(reference).toBeUndefined();
    await expect(keeper.getByText(/has no bin on .*A shelf manager has to assign it/)).toBeVisible();
});

// Last: once its units land, a waiting shelf refill takes them on to the shelf and fills the bin
// the shelving tests above need room in.
test('transfer Remote Hub → store floor: raised, claimed, handed over and received', async ({ browser }) => {
    test.setTimeout(180_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const variant = fixture.remoteVariant.id;
    const { remoteHub, transit } = fixture.locations;
    // "store": every store location but the Remote Hub. When a shelf refill is waiting for this
    // item, landed units go on towards the shelf at once (RefillWorkflow::fulfil), so the
    // floor alone is not the measure; the store as a whole is.
    const at = () => {
        const all = stockOf(variant);
        const store = Object.entries(all).filter(([id]) => ![remoteHub, transit].includes(Number(id))).reduce((sum, [, units]) => sum + units, 0);

        return { remote: all[String(remoteHub)] ?? 0, transit: all[String(transit)] ?? 0, store };
    };
    const before = at();

    const reference = await test.step('the stock keeper raises the transfer', () => raise(keeper, /Remote Hub/, /Store Floor/, quantity).then((ref) => ref!));

    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await test.step('the courier claims it from the pool', () => claim(courier, reference));

    await test.step('the stock keeper hands it to the courier', async () => {
        await handToCourier(keeper, reference);
        // Out of the Remote Hub, into the courier's hands.
        expect(at()).toEqual({ remote: before.remote - quantity, transit: before.transit + quantity, store: before.store });
    });

    await test.step('the courier hands it over at the store; it is not landed yet', async () => {
        await handOver(courier, reference);
        // Handing over moves nothing: still the courier's until the store counts it in.
        expect(at()).toEqual({ remote: before.remote - quantity, transit: before.transit + quantity, store: before.store });
    });

    await test.step('the store keeper checks it and receives it: now it lands on the floor', async () => {
        await keeper.goto(app('stockkeeper', '/transfers'));
        await expect(cardOf(keeper, reference)).toContainText('handed over: check it and receive it');
        await receive(keeper, reference, { sent: quantity });

        const done = keeper.locator('li').filter({ hasText: reference });
        await expect(done).toContainText('landed');
        await expect(done.getByRole('button')).toHaveCount(0);
        // Landed in the store; the courier holds nothing.
        expect(at()).toEqual({ remote: before.remote - quantity, transit: before.transit, store: before.store + quantity });
    });
});
