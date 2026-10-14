import { expect, test, type Locator, type Page } from '@playwright/test';
import { unitsAt } from '../lib/inspect';
import { app, fixture, signIn } from '../lib/support';

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

/** Picks the option of a native select whose text matches. */
async function choose(select: Locator, text: RegExp): Promise<void> {
    const options = await select.locator('option').allTextContents();
    const label = options.find((o) => text.test(o));
    if (!label) throw new Error(`No option matching ${text} in: ${options.join(' | ')}`);
    await select.selectOption({ label });
}

/** The card of transfer `reference`: the nearest ancestor of its reference that holds buttons and no other transfer. */
const cardOf = (page: Page, reference: string) =>
    page.getByText(reference).first().locator(`xpath=ancestor::*[.//button][count(.//*[starts-with(normalize-space(text()), 'TRF-')]) = 1][last()]`);

/** Raises a transfer of the seeded variant on the keeper's Transfers page and returns its reference. */
async function raise(keeper: Page, from: RegExp, to: RegExp, units: number, item = fixture.remoteVariant.item): Promise<string | undefined> {
    const refs = async () => (await keeper.locator('main').innerText()).match(/TRF-[A-Z0-9]+-[A-Z0-9]+/g) ?? [];

    await keeper.goto(app('stockkeeper', '/transfers'));
    const before = new Set(await refs());
    await keeper.getByRole('button', { name: /Raise transfer/ }).first().click();
    await keeper.getByPlaceholder('Search by name, SKU or barcode').fill(item);
    await keeper.getByRole('button', { name: new RegExp(item) }).first().click();
    // The SKU choices: the seeded variant when it is that item, else the first.
    const sku = keeper.getByRole('button', { name: /DUKA-/ });
    await (item === fixture.remoteVariant.item ? sku.filter({ hasText: fixture.remoteVariant.sku }) : sku.first()).click();
    await choose(keeper.locator('select').nth(0), from);
    await choose(keeper.locator('select').nth(1), to);
    await keeper.locator('input[type="number"]').fill(String(units));
    await keeper.getByRole('button', { name: 'Raise transfer' }).last().click();

    // The new transfer is the reference that was not on the page before; none when refused.
    let reference: string | undefined;
    await expect(async () => {
        reference = (await refs()).find((ref) => !before.has(ref));
        expect(reference ?? (await keeper.getByText(/has no bin on/).count())).toBeTruthy();
    }).toPass({ timeout: 15_000 });

    return reference;
}

test('transfer Remote Hub → store floor: raised, claimed, handed over and received', async ({ browser }) => {
    test.setTimeout(180_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const variant = fixture.remoteVariant.id;
    const { remoteHub, floor, transit } = fixture.locations;
    const at = () => ({ remote: unitsAt(variant, remoteHub), transit: unitsAt(variant, transit), floor: unitsAt(variant, floor) });
    const before = at();

    const reference = await test.step('the stock keeper raises the transfer', () => raise(keeper, /Remote Hub/, /Store Floor/, quantity).then((ref) => ref!));
    const card = (page: Page) => cardOf(page, reference);

    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await test.step('the courier claims it from the pool', async () => {
        await courier.goto(app('delivery', '/transfers'));
        await card(courier).getByRole('button', { name: 'Claim' }).click();
        await courier.goto(app('delivery', '/transfers?tab=mine'));
        await expect(courier.getByText(reference)).toBeVisible();
    });

    await test.step('the stock keeper hands it to the courier', async () => {
        await keeper.goto(app('stockkeeper', '/transfers'));
        await card(keeper).getByRole('button', { name: 'Hand to courier' }).click();
        await expect(card(keeper).getByRole('button', { name: 'Receive' })).toBeVisible();
        // Out of the Remote Hub, into the courier's hands.
        expect(at()).toEqual({ remote: before.remote - quantity, transit: before.transit + quantity, floor: before.floor });
    });

    await test.step('the courier hands it over at the store; it is not landed yet', async () => {
        await courier.goto(app('delivery', '/transfers?tab=mine'));
        await card(courier).getByRole('button', { name: 'Hand over' }).click();
        await expect(courier.getByText('Handed over — the store checks and receives it')).toBeVisible();
        // Handing over moves nothing: still the courier's until the store counts it in.
        expect(at()).toEqual({ remote: before.remote - quantity, transit: before.transit + quantity, floor: before.floor });
    });

    await test.step('the store keeper checks it and receives it: now it lands on the floor', async () => {
        await keeper.goto(app('stockkeeper', '/transfers'));
        await expect(card(keeper)).toContainText('handed over: check it and receive it');
        await card(keeper).getByRole('button', { name: 'Receive' }).click();

        const sheet = keeper.getByRole('heading', { name: `Receive ${reference}` }).locator('xpath=ancestor::*[.//button[@type="submit"]][1]');
        await expect(sheet.locator('input[type="number"]').first()).toHaveValue(String(quantity));
        await sheet.getByRole('button', { name: 'Receive', exact: true }).click();

        // A finished card has no buttons, so find it as its list item.
        const done = keeper.locator('li').filter({ hasText: reference });
        await expect(done).toContainText('Completed');
        await expect(done).toContainText('landed');
        await expect(done.getByRole('button')).toHaveCount(0);
        // Landed on the floor; the courier holds nothing.
        expect(at()).toEqual({ remote: before.remote - quantity, transit: before.transit, floor: before.floor + quantity });
    });
});

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
