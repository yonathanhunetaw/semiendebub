import { expect, test, type Page } from '@playwright/test';
import { shipmentOf, transferOf, unitsAt } from '../lib/inspect';
import { app, fixture, signIn } from '../lib/support';
import { cardOf, raiseTransfer as raise } from '../lib/transfers';

/**
 * The Guide world's Play mode, Store Floor → Store Shelf. In Live, putting a job up on the
 * shelf calls the real Shelve route (game/actions.ts) through Inertia with preserveState:
 * the shelving happens, and the world stays as it was: the same canvas, no reload.
 * A job the server refuses comes back down into the worker's arms.
 */

/** Opens the world, steps into Play and waits for the shelving list. */
async function play(page: Page, subdomain: 'stockkeeper' | 'seller'): Promise<void> {
    await page.goto(app(subdomain, '/guide?view=world'));
    // `make dev`'s Vite reloads every open page when a PHP file changes (the domain-map plugin), which
    // drops the game back to Practice at its start. Say so plainly if it happens, rather than time out puzzled.
    page.on('load', () => console.warn(`[play.spec] the page reloaded under the test (a file in app/ changed?): ${page.url()}`));
    await page.getByRole('button', { name: 'Play as a worker' }).click();
    await expect(page.getByText('Practice: nothing is saved')).toBeVisible();
}

/** Tap the line that says what to do next: the worker walks there (hurrying), and the zone's control shows. */
async function walkByObjective(page: Page, objective: RegExp, arrived: () => Promise<void>): Promise<void> {
    await page.getByRole('button', { name: objective }).click();
    await page.keyboard.down('Shift');
    await arrived();
    await page.keyboard.up('Shift');
}

const pickerOpen = (page: Page) => expect(page.getByText('Store Floor: to shelve')).toBeVisible({ timeout: 90_000 });
const atShelf = (page: Page) => expect(page.getByRole('button', { name: /Shelve for real|Put up/ })).toBeVisible({ timeout: 90_000 });

async function goLive(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(page.getByText('Play for real?')).toBeVisible();
    await page.getByRole('button', { name: 'Go Live' }).click();
    await expect(page.getByText('LIVE: drops make real records')).toBeVisible();
}

/** Takes the job `reference` off the floor. */
async function take(page: Page, reference: string): Promise<void> {
    const row = page.locator('div').filter({ hasText: reference }).filter({ has: page.getByRole('button', { name: 'Take', exact: true }) }).last();
    await row.getByRole('button', { name: 'Take', exact: true }).click();
    await expect(page.getByText('Carrying 1 job')).toBeVisible();
}

test('Live: a floor → shelf job carried across in the world is shelved for real, and the world stays put', async ({ browser }) => {
    test.setTimeout(240_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const errors: string[] = [];
    keeper.on('pageerror', (error) => errors.push(error.message));
    const variant = fixture.remoteVariant.id;
    const { floor, shelf } = fixture.locations;

    const reference = (await raise(keeper, /Store Floor/, /Store Shelf/, 2))!;
    expect(reference).toBeTruthy();
    const before = { floor: unitsAt(variant, floor), shelf: unitsAt(variant, shelf) };

    await play(keeper, 'stockkeeper');
    await goLive(keeper);
    // The canvas the world draws on: after shelving it must be the very same element (no remount).
    await keeper.evaluate(() => ((window as unknown as { worldCanvas: Element | null }).worldCanvas = document.querySelector('canvas')));

    await walkByObjective(keeper, /to shelve from the Store Floor/, () => pickerOpen(keeper));
    await take(keeper, reference);
    await walkByObjective(keeper, /up on the Store Shelf/, () => atShelf(keeper));
    await keeper.getByRole('button', { name: /Shelve for real/ }).click();

    await expect(keeper.getByText(new RegExp(`Shelved for real: .*${reference}`))).toBeVisible({ timeout: 20_000 });
    await expect(keeper.getByText('Hands free')).toBeVisible();
    await keeper.screenshot({ path: 'test-results/play-live-shelved.png' });

    expect(transferOf(reference).status).toBe('completed');
    expect({ floor: unitsAt(variant, floor), shelf: unitsAt(variant, shelf) }).toEqual({ floor: before.floor - 2, shelf: before.shelf + 2 });
    expect(await keeper.evaluate(() => {
        const kept = (window as unknown as { worldCanvas: Element | null }).worldCanvas;
        return kept !== null && kept.isConnected && document.querySelector('canvas') === kept;
    })).toBe(true);
    // Still in Live, still playing: nothing reset.
    await expect(keeper.getByText('LIVE: drops make real records')).toBeVisible();
    expect(errors).toEqual([]);
});

test('Live: a job cancelled behind the worker\'s back is refused, and its boxes come back down', async ({ browser }) => {
    test.setTimeout(240_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const reference = (await raise(keeper, /Store Floor/, /Store Shelf/, 1))!;
    expect(reference).toBeTruthy();

    await play(keeper, 'stockkeeper');
    await goLive(keeper);
    await walkByObjective(keeper, /to shelve from the Store Floor/, () => pickerOpen(keeper));
    await take(keeper, reference);

    // Meanwhile, on another screen, the transfer is cancelled.
    const elsewhere = await keeper.context().newPage();
    await elsewhere.goto(app('stockkeeper', '/transfers'));
    await cardOf(elsewhere, reference).getByRole('button', { name: 'Cancel' }).click();
    await expect.poll(() => transferOf(reference).status, { timeout: 15_000 }).toBe('cancelled');
    await elsewhere.close();

    await walkByObjective(keeper, /up on the Store Shelf/, () => atShelf(keeper));
    await keeper.getByRole('button', { name: /Shelve for real/ }).click();

    // Refused: the reason shows, and the job is back in the worker's arms.
    await expect(keeper.getByRole('alert').filter({ hasText: reference })).toBeVisible({ timeout: 20_000 });
    await expect(keeper.getByText('Carrying 1 job')).toBeVisible();
    await keeper.screenshot({ path: 'test-results/play-live-refused.png' });
    expect(transferOf(reference).status).toBe('cancelled');
});

test('Practice: a scheduled shipment is fetched from the hub and loaded into the freight car, and the gauge counts it', async ({ browser }) => {
    test.setTimeout(240_000);
    const load = fixture.playLoad;
    test.skip(!load, 'the fixture has no main hub shipment to load');
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const errors: string[] = [];
    keeper.on('pageerror', (error) => errors.push(error.message));

    await play(keeper, 'stockkeeper');
    // The goal line names the shipment and sends the worker to its hub.
    const goal = new RegExp(`${load!.reference}: 0 / ${load!.quantity} in the car, ${load!.quantity} to fetch from Hub`);
    await expect(keeper.getByRole('button', { name: goal })).toBeVisible({ timeout: 15_000 });
    await walkByObjective(keeper, goal, () => expect(keeper.getByText(new RegExp(`: for ${load!.reference}$`))).toBeVisible({ timeout: 90_000 }));
    await keeper.screenshot({ path: 'test-results/play-freight-hub.png' });

    await keeper.getByRole('button', { name: 'Take what fits' }).click();
    await expect(keeper.getByText(new RegExp(`Carrying \\d+ for ${load!.reference}`))).toBeVisible();
    await walkByObjective(keeper, /Load it into the freight car/, () => expect(keeper.getByRole('button', { name: /^Load \d+/ })).toBeVisible({ timeout: 90_000 }));
    await keeper.getByRole('button', { name: /^Load \d+/ }).click();

    await expect(keeper.getByText(/Practice: nothing was picked for real/)).toBeVisible({ timeout: 15_000 });
    await expect(keeper.getByText(new RegExp(`\\d+ / ${load!.quantity} units in the car`))).toBeVisible();
    await keeper.waitForTimeout(1500);
    await keeper.screenshot({ path: 'test-results/play-freight-loaded.png' });
    // Further out (the follow camera's zoom): the car and the load in its hold.
    const view = keeper.viewportSize()!;
    await keeper.mouse.move(view.width / 2, view.height / 2);
    await keeper.mouse.wheel(0, 900);
    await keeper.waitForTimeout(1500);
    await keeper.screenshot({ path: 'test-results/play-freight-car.png' });
    expect(errors).toEqual([]);
});

// After the Practice freight test, which leaves the shipment untouched; e2e:prepare puts it back to scheduled every run.
test('Live: the hub keeper loads the shipment for real and marks it prepared for the courier', async ({ browser }) => {
    test.setTimeout(300_000);
    const load = fixture.playLoad;
    test.skip(!load, 'the fixture has no main hub shipment to load');
    expect(shipmentOf(load!.reference).status).toBe('scheduled');
    const hubKeeper = await signIn(browser, 'stockkeeper', fixture.people.hubKeeper.email);
    const errors: string[] = [];
    hubKeeper.on('pageerror', (error) => errors.push(error.message));

    await play(hubKeeper, 'stockkeeper');
    // The hub keeper cannot shelve, but works Hub A's dock: Live is offered for the car.
    await goLive(hubKeeper);
    await hubKeeper.evaluate(() => ((window as unknown as { worldCanvas: Element | null }).worldCanvas = document.querySelector('canvas')));

    const goal = new RegExp(`${load!.reference}: 0 / ${load!.quantity} in the car, ${load!.quantity} to fetch from Hub`);
    await walkByObjective(hubKeeper, goal, () => expect(hubKeeper.getByText(new RegExp(`: for ${load!.reference}$`))).toBeVisible({ timeout: 90_000 }));
    await hubKeeper.getByRole('button', { name: 'Take what fits' }).click();
    await walkByObjective(hubKeeper, /Load it into the freight car/, () => expect(hubKeeper.getByRole('button', { name: /^Load for real \d+/ })).toBeVisible({ timeout: 90_000 }));
    await hubKeeper.getByRole('button', { name: /^Load for real \d+/ }).click();

    // The whole line went in: it is ticked picked for real (and picking started with it).
    await expect(hubKeeper.getByText(new RegExp(`Recorded for real: .* picked on ${load!.reference}`))).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => shipmentOf(load!.reference).lines.every((l) => l.picked === l.quantity), { timeout: 15_000 }).toBe(true);
    expect(shipmentOf(load!.reference).status).toBe('picking');

    await hubKeeper.getByRole('button', { name: 'Mark prepared: ready for the courier' }).click();
    await expect(hubKeeper.getByText(new RegExp(`${load!.reference} is prepared`))).toBeVisible({ timeout: 20_000 });
    await hubKeeper.screenshot({ path: 'test-results/play-freight-prepared.png' });
    await expect.poll(() => shipmentOf(load!.reference).status, { timeout: 15_000 }).toBe('ready');
    expect(shipmentOf(load!.reference).prepared).toBe(true);

    // The world never reloaded, and it is still Live.
    expect(await hubKeeper.evaluate(() => {
        const kept = (window as unknown as { worldCanvas: Element | null }).worldCanvas;
        return kept !== null && kept.isConnected && document.querySelector('canvas') === kept;
    })).toBe(true);
    await expect(hubKeeper.getByText('LIVE: drops make real records')).toBeVisible();
    expect(errors).toEqual([]);
});

test('a seller practises the same job but is never offered Live', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await play(seller, 'seller');
    await expect(seller.getByText(/to shelve from the Store Floor|Nothing waiting|All shelved|bins need stock/)).toBeVisible({ timeout: 15_000 });
    await expect(seller.getByRole('button', { name: 'Live', exact: true })).toHaveCount(0);
});
