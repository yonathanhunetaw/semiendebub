import { expect, test, type Page } from '@playwright/test';
import { shipmentOf, transferOf, unitsAt } from '../lib/inspect';
import { app, closeWindows, fixture, signIn } from '../lib/support';
import { cardOf, raiseTransfer as raise } from '../lib/transfers';

/**
 * The Guide world's Play mode, Store Floor → Store Shelf. In Live, putting a job up on the
 * shelf calls the real Shelve route (game/actions.ts) through Inertia with preserveState:
 * the shelving happens, and the world stays as it was: the same canvas, no reload.
 * A job the server refuses comes back down into the worker's arms.
 */

// One world rendering at a time: left open, every earlier test's 3D page keeps drawing, and in a
// headless browser (software graphics) the frame rate, and with it the worker's walking, collapses.
test.afterEach(async () => closeWindows());

/** Opens the world, steps into Play and waits for the shelving list. */
async function play(page: Page, subdomain: 'stockkeeper' | 'seller' | 'delivery'): Promise<void> {
    await page.goto(app(subdomain, '/guide?view=world'));
    // `make dev`'s Vite reloads every open page when a PHP file changes (the domain-map plugin), which
    // drops the game back to Practice at its start. Say so plainly if it happens, rather than time out puzzled.
    page.on('load', () => console.warn(`[play.spec] the page reloaded under the test (a file in app/ changed?): ${page.url()}`));
    // Play is remembered per device: a second visit by the same person is already in it.
    const start = page.getByRole('button', { name: 'Play as a worker' });
    await expect(start.or(page.getByRole('button', { name: 'Follow', exact: true }))).toBeVisible({ timeout: 30_000 });
    if (await start.isVisible()) await start.click();
    // In Play: the camera switch shows (the long Practice chip is hidden on a phone).
    await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
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

/** The Live half of the Practice / Live switch: pressed while Live is on. */
const live = (page: Page) => page.getByRole('button', { name: 'Live', exact: true });

async function goLive(page: Page): Promise<void> {
    await page.getByRole('button', { name: 'Live', exact: true }).click();
    await expect(page.getByText('Play for real?')).toBeVisible();
    await page.getByRole('button', { name: 'Go Live' }).click();
    await expect(live(page)).toHaveAttribute('aria-pressed', 'true');
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
    await expect(live(keeper)).toHaveAttribute('aria-pressed', 'true');
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
    await expect(live(hubKeeper)).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
});

/** Draws a squiggle on the signature pad. */
async function sign(page: Page): Promise<void> {
    const pad = page.getByTestId('signature-pad');
    await expect(pad).toBeVisible();
    const box = (await pad.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.2 + i * 0.08), box.y + box.height * (i % 2 ? 0.25 : 0.75));
    await page.mouse.up();
}

// Straight after the hub keeper marked SHP-E2E-PLAY prepared (above): the courier's half, in the delivery app's world.
test('Live: the courier starts, checks, signs and arrives, each step for real', async ({ browser }) => {
    test.setTimeout(300_000);
    const load = fixture.playLoad;
    test.skip(!load, 'the fixture has no main hub shipment');
    expect(shipmentOf(load!.reference).status).toBe('ready');
    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    const errors: string[] = [];
    courier.on('pageerror', (error) => errors.push(error.message));

    await play(courier, 'delivery');
    await goLive(courier);

    const stepAt = async (goal: RegExp, button: RegExp, done: () => boolean) => {
        await walkByObjective(courier, goal, () => expect(courier.getByTestId(`run-${load!.reference}`)).toBeVisible({ timeout: 90_000 }));
        if (/Sign/.test(String(button))) await sign(courier);
        await courier.getByRole('button', { name: button }).click();
        await expect.poll(done, { timeout: 20_000 }).toBe(true);
    };

    await stepAt(new RegExp(`${load!.reference}: start the trip`), /Start the trip to the pickup \(for real\)/, () => shipmentOf(load!.reference).courier_started);
    await stepAt(new RegExp(`${load!.reference}: check the load`), /Check the load \(for real\)/, () => shipmentOf(load!.reference).courier_checked);
    await stepAt(new RegExp(`${load!.reference}: sign & take the load`), /Sign & take the load/, () => shipmentOf(load!.reference).courier_signed);
    expect(shipmentOf(load!.reference).status).toBe('in_transit');
    await stepAt(new RegExp(`${load!.reference}: arrived at the destination`), /Arrived at the destination \(for real\)/, () => shipmentOf(load!.reference).status === 'delivered');
    await courier.screenshot({ path: 'test-results/play-courier-arrived.png' });
    expect(errors).toEqual([]);
});

// Then the receiving dock: check the goods, count them (one short, one damaged), sign them in.
test('Live: the receiving keeper checks, counts and signs the goods in, and the difference is logged', async ({ browser }) => {
    test.setTimeout(300_000);
    const load = fixture.playLoad;
    test.skip(!load, 'the fixture has no main hub shipment');
    expect(shipmentOf(load!.reference).status).toBe('delivered');
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const errors: string[] = [];
    keeper.on('pageerror', (error) => errors.push(error.message));

    await play(keeper, 'stockkeeper');
    await goLive(keeper);
    const card = keeper.getByTestId(`run-${load!.reference}`);
    await walkByObjective(keeper, new RegExp(`${load!.reference}: check the goods`), () => expect(card).toBeVisible({ timeout: 90_000 }));
    await card.getByRole('button', { name: /Check the goods/ }).click();
    await expect.poll(() => shipmentOf(load!.reference).receiver_checked, { timeout: 20_000 }).toBe(true);

    // Count: one fewer than asked, one of those damaged.
    const variant = load!.variant;
    await card.getByTestId(`got-${variant}`).fill(String(load!.quantity - 1));
    await card.getByTestId(`bad-${variant}`).fill('1');
    await card.getByRole('button', { name: /Save the count for real/ }).click();
    await expect.poll(() => shipmentOf(load!.reference).lines[0].received, { timeout: 20_000 }).toBe(load!.quantity - 1);
    expect(shipmentOf(load!.reference).lines[0].damaged).toBe(1);

    await sign(keeper);
    await card.getByRole('button', { name: /Sign & receive/ }).click();
    await expect.poll(() => shipmentOf(load!.reference).status, { timeout: 20_000 }).toBe('received');
    await keeper.screenshot({ path: 'test-results/play-received.png' });
    expect(errors).toEqual([]);
});

// The short count the receiving keeper just recorded waits at the Receiving desk for someone else to settle.
test('Live: the receiving desk settles the difference, but not for the keeper who counted it', async ({ browser }) => {
    test.setTimeout(240_000);
    const load = fixture.playLoad;
    test.skip(!load, 'the fixture has no main hub shipment');
    const errors: string[] = [];

    // Whoever counted it is offered no way to settle it.
    const counter = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    counter.on('pageerror', (error) => errors.push(error.message));
    await play(counter, 'stockkeeper');
    await goLive(counter);
    await walkByObjective(counter, /Receiving: \d+ waiting/, () => expect(counter.getByTestId('station-receiving')).toBeVisible({ timeout: 90_000 }));
    await expect(counter.getByText(/You recorded this: someone else settles it/)).toBeVisible();
    await expect(counter.getByRole('button', { name: /Found it/ })).toHaveCount(0);

    // Someone else settles it, for real.
    const other = await signIn(browser, 'stockkeeper', fixture.people.keeper2.email);
    other.on('pageerror', (error) => errors.push(error.message));
    await play(other, 'stockkeeper');
    await goLive(other);
    await walkByObjective(other, /Receiving: \d+ waiting/, () => expect(other.getByTestId('station-receiving')).toBeVisible({ timeout: 90_000 }));
    await other.getByRole('button', { name: /Found it/ }).first().click();
    await other.getByRole('button', { name: /Found it \(for real\)/ }).click();
    await expect(other.getByText(/RD-.* settled\./)).toBeVisible({ timeout: 20_000 });
    await other.screenshot({ path: 'test-results/play-receiving-desk.png' });
    expect(errors).toEqual([]);
});

// A transfer between sites is a relay between people on different apps: each does their own part in the world, for real.
test('Live: a Remote Hub → floor transfer is claimed, dispatched, handed over and received, each by the right person', async ({ browser }) => {
    test.setTimeout(420_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    const errors: string[] = [];
    keeper.on('pageerror', (error) => errors.push(error.message));
    courier.on('pageerror', (error) => errors.push(error.message));
    const reference = (await raise(keeper, /Remote Hub/, /Store Floor/, 2))!;
    expect(reference).toBeTruthy();
    const variant = fixture.remoteVariant.id;
    const { floor, remoteHub } = fixture.locations;
    const before = { floor: unitsAt(variant, floor), remote: unitsAt(variant, remoteHub) };

    /** Opens the world as `page` in Live and stands at the zone whose card lists the transfer, then runs `act` on that card. */
    const doStep = async (page: Page, subdomain: 'stockkeeper' | 'delivery', goal: RegExp, button: RegExp) => {
        await play(page, subdomain);
        await goLive(page);
        await walkByObjective(page, goal, () => expect(page.getByTestId(`leg-${reference}`)).toBeVisible({ timeout: 90_000 }));
        await page.getByTestId(`leg-${reference}`).getByRole('button', { name: button }).click();
    };

    // 1. The courier claims it at the Remote Hub's door.
    await doStep(courier, 'delivery', /transfers? .*→|take it on/i, /Take it on \(claim\) \(for real\)/);
    await expect.poll(() => transferOf(reference).status, { timeout: 20_000 }).toBe('pending');
    await courier.getByText(/You are carrying/).waitFor({ timeout: 20_000 });

    // 2. The Remote Hub's keeper hands it to the courier: dispatch, the stock leaves into Delivery.
    await doStep(keeper, 'stockkeeper', /transfers? .*→|hand it to the courier/i, /Hand it to the courier \(dispatch\) \(for real\)/);
    await expect.poll(() => transferOf(reference).status, { timeout: 20_000 }).toBe('in_transit');
    expect(unitsAt(variant, remoteHub)).toBe(before.remote - 2);

    // 3. The courier hands it over at the shop's door.
    await doStep(courier, 'delivery', /transfers? .*→|hand it over/i, /Hand it over at the destination \(for real\)/);
    await expect.poll(() => transferOf(reference).handed_over, { timeout: 20_000 }).toBe(true);

    // 4. The shop's keeper checks it, counts it and receives it: it lands on the floor.
    await doStep(keeper, 'stockkeeper', /transfers? .*→|check & receive/i, /Check & receive \(for real\)/);
    await expect.poll(() => transferOf(reference).status, { timeout: 20_000 }).toBe('completed');
    expect(unitsAt(variant, floor)).toBe(before.floor + 2);
    await keeper.screenshot({ path: 'test-results/play-leg-received.png' });
    expect(errors).toEqual([]);
});

test('Practice: Remote Hub → store goes hub keeper → courier → store keeper, and nothing is saved', async ({ browser }) => {
    test.setTimeout(300_000);
    const keeper = await signIn(browser, 'stockkeeper', fixture.keeper.email);
    const errors: string[] = [];
    keeper.on('pageerror', (error) => errors.push(error.message));
    // A real transfer waiting for its courier: what the Remote Hub's list shows in the world.
    const reference = (await raise(keeper, /Remote Hub/, /Store Floor/, 2))!;
    expect(reference).toBeTruthy();

    await play(keeper, 'stockkeeper');
    // As the hub keeper: into the Remote Hub, take it out.
    await walkByObjective(keeper, /waiting in the Remote Hub for a courier/, () => expect(keeper.getByText('Remote Hub: for the store')).toBeVisible({ timeout: 90_000 }));
    const row = keeper.locator('div').filter({ hasText: reference }).filter({ has: keeper.getByRole('button', { name: 'Take', exact: true }) }).last();
    await row.getByRole('button', { name: 'Take', exact: true }).click();
    await expect(keeper.getByText("You are the Remote Hub's keeper", { exact: true })).toBeVisible();

    // At the hub's door it goes to the courier, who is now you.
    await walkByObjective(keeper, /Hand it to the courier/, () => expect(keeper.getByRole('button', { name: /Hand to the courier/ })).toBeVisible({ timeout: 90_000 }));
    await keeper.getByRole('button', { name: /Hand to the courier/ }).click();
    await expect(keeper.getByText('You are the courier', { exact: true })).toBeVisible({ timeout: 10_000 });
    await keeper.waitForTimeout(800);
    await keeper.screenshot({ path: 'test-results/play-relay-courier.png' });

    // Round to the shop's front door: handed over, then received by the store's keeper.
    await walkByObjective(keeper, /As the courier/, () => expect(keeper.getByRole('button', { name: /Hand over/ })).toBeVisible({ timeout: 90_000 }));
    await keeper.getByRole('button', { name: /Hand over/ }).click();
    await expect(keeper.getByText("You are the store's keeper", { exact: true })).toBeVisible({ timeout: 10_000 });
    await keeper.getByRole('button', { name: /Check & receive/ }).click();
    await expect(keeper.getByText(new RegExp(`Received ${reference} onto the store floor`))).toBeVisible({ timeout: 10_000 });
    await keeper.screenshot({ path: 'test-results/play-relay-received.png' });

    // Practice: the real transfer is untouched.
    expect(transferOf(reference).status).toBe('pending');
    expect(errors).toEqual([]);
});

test('a seller practises the same job; Live is only for the desks\' real actions, never the Remote Hub', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await play(seller, 'seller');
    await expect(seller.getByText(/to shelve from the Store Floor|Nothing waiting|All shelved|bins need stock/)).toBeVisible({ timeout: 15_000 });
    // No Remote Hub job for a seller: the Remote Hub is yes/no to them, never quantities.
    await expect(seller.getByText(/waiting in the Remote Hub/)).toHaveCount(0);
    await seller.waitForTimeout(1500);
    await seller.screenshot({ path: 'test-results/play-phone.png' });
    const phone = seller.viewportSize()!;
    await seller.setViewportSize({ width: 1440, height: 900 });
    await seller.waitForTimeout(1500);
    await seller.screenshot({ path: 'test-results/play-desktop.png' });
    await seller.setViewportSize(phone);

    // Stepping out to Watch and back, again and again, leaves nothing of Play behind on the page.
    const leftovers = () => seller.evaluate(() => document.querySelectorAll('.world-stick, .world-badge--zone').length);
    for (let i = 0; i < 3; i++) {
        await seller.getByRole('button', { name: 'Back to watching' }).click();
        await expect(seller.getByRole('button', { name: 'Play as a worker' })).toBeVisible();
        expect(await leftovers()).toBe(0);
        await seller.getByRole('button', { name: 'Play as a worker' }).click();
        await expect(seller.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
    }
    // In Play there is exactly one touch stick, however often Play was entered.
    expect(await seller.evaluate(() => document.querySelectorAll('.world-stick').length)).toBe(1);
});
