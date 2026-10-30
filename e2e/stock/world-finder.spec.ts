import { resetPlayLoad } from '../lib/inspect';
import { expect, test } from '@playwright/test';
import { app, closeWindows, fixture, signIn } from '../lib/support';
import { playIn } from '../lib/world';

/**
 * The world's Director view and the hub item finder, on a wide and on a narrow screen:
 *   - the camera / Practice-Live controls ride in the top bar beside the title when the screen is wider than tall,
 *     and drop back under it on a narrow one;
 *   - pressing a building in Director flies the camera round to face its door;
 *   - while a hub is open a small search button opens an item selector of what it holds; choosing one marks its boxes
 *     and folds the selector back to a chip (walk there, clear).
 * Screenshots are kept in test-results/ for the owner to look at.
 */
test.afterEach(async () => closeWindows());

test('Director faces the door, the hub item finder marks an item, and the controls move to the top bar when wide', async ({ browser }) => {
    // Several walks across the 3D world, the last one to Hub A: slow on a busy machine.
    test.setTimeout(420_000);
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1180, height: 700 });
    await playIn(page, 'admin');

    const centreY = async (locator: ReturnType<typeof page.getByText>) => {
        const box = (await locator.boundingBox())!;
        return box.y + box.height / 2;
    };
    const title = page.getByText('Live Operations', { exact: true });
    const follow = page.getByRole('button', { name: 'Follow', exact: true });

    await test.step('wide: the camera switch is in the top bar, level with the title', async () => {
        expect(Math.abs((await centreY(follow)) - (await centreY(title)))).toBeLessThan(30);
        await page.screenshot({ path: 'test-results/finder-1-wide-topbar.png' });
    });

    await test.step('narrow: it drops back under the top bar', async () => {
        await page.setViewportSize({ width: 420, height: 820 });
        await page.waitForTimeout(800);
        expect((await centreY(follow)) - (await centreY(title))).toBeGreaterThan(30);
        await page.screenshot({ path: 'test-results/finder-2-narrow.png' });
        await page.setViewportSize({ width: 1180, height: 700 });
        await page.waitForTimeout(800);
    });

    await test.step('Director: pressing a building flies to its door', async () => {
        await page.getByRole('button', { name: 'Director', exact: true }).click();
        await page.waitForTimeout(1800);
        await page.screenshot({ path: 'test-results/finder-3-director-site.png' });
        await page.locator('.world-label', { hasText: 'Remote Hub' }).first().click();
        await page.waitForTimeout(2200);
        await page.screenshot({ path: 'test-results/finder-4-director-door.png' });
    });

    await test.step('the finder lists what the hub holds, and choosing an item marks it', async () => {
        await expect(page.getByTestId('item-finder')).toBeVisible();
        // A small search button until tapped (it once was a bar across the screen).
        await page.getByTestId('item-finder-open').click();
        await page.getByTestId('item-finder-input').click();
        const first = page.getByRole('option').first();
        await expect(first).toBeVisible();
        const name = (await first.locator('p, span').first().innerText()).trim();
        await first.click();
        await expect(page.getByTestId('item-finder-result')).toBeVisible();
        await page.waitForTimeout(2200);
        await page.screenshot({ path: 'test-results/finder-5-marked.png' });
        await expect(page.locator('.world-badge--find').first()).toBeVisible();
        expect(name.length).toBeGreaterThan(0);
        // clearing the choice removes the mark
        await page.getByRole('button', { name: 'Clear' }).click();
        await expect(page.locator('.world-badge--find')).toHaveCount(0);
    });

    await test.step('Play: walking into a hub brings the finder up, and the worker can walk to the item', async () => {
        // The play specs before this one load and deliver the freight shipment; put it back waiting.
        resetPlayLoad();
        await playIn(page, 'admin');
        await page.getByRole('button', { name: 'Follow', exact: true }).click();
        await page.waitForTimeout(500);
        // The goal line "… to fetch from Hub A" walks the worker there.
        await page.getByRole('button', { name: /fetch from Hub A/ }).click();
        await expect(page.getByTestId('item-finder')).toContainText('Main Hub A', { timeout: 120_000 });
        // The finder flows under Play's goals row: it must never cover the Desks button or the goals (it once did, on a phone).
        const clearOfGoals = async () => {
            const finderBox = (await page.getByTestId('item-finder').boundingBox())!;
            const desksBox = (await page.getByRole('button', { name: 'Desks', exact: true }).boundingBox())!;
            expect(finderBox.y).toBeGreaterThanOrEqual(desksBox.y + desksBox.height - 2);
        };
        await clearOfGoals();
        await page.setViewportSize({ width: 393, height: 852 });
        await page.waitForTimeout(800);
        await clearOfGoals();
        // On a phone in a hub it is only a small round button at the right, not a bar over the view.
        const button = (await page.getByTestId('item-finder-open').boundingBox())!;
        expect(button.width).toBeLessThan(60);
        expect(button.x).toBeGreaterThan(393 / 2);
        await page.screenshot({ path: 'test-results/finder-6b-phone.png' });
        await page.setViewportSize({ width: 1180, height: 700 });
        await page.waitForTimeout(800);
        await page.getByTestId('item-finder-open').click();
        await page.getByTestId('item-finder-input').click();
        await page.getByRole('option').first().click();
        await expect(page.getByRole('button', { name: 'Walk there' })).toBeVisible();
        await page.waitForTimeout(1800);
        await page.screenshot({ path: 'test-results/finder-6-play-hub.png' });
        await page.getByRole('button', { name: 'Walk there' }).click();
        await page.waitForTimeout(4000);
        await page.screenshot({ path: 'test-results/finder-7-walked.png' });
    });

    expect(errors).toEqual([]);
});

/**
 * Racks view: put each item on the shelf. Pick an item, tap a slot on the racks, and its bin stands there (the server
 * records it: `spot`); another item tapped onto the same slot swaps with it. Whoever may change the planogram sees the tool.
 */
test('Racks view: an item is put on a slot by tapping it, and a taken slot swaps', async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width: 1180, height: 700 });
    await page.goto(app('admin', '/guide?view=world'));
    // This device may remember Play from an earlier test: the racks view is in Watch.
    const watch = page.getByRole('button', { name: 'Back to watching' });
    await expect(watch.or(page.getByRole('button', { name: "See the shop's racks" }))).toBeVisible({ timeout: 60_000 });
    if (await watch.isVisible()) await watch.click();

    const today = new Date().toISOString().slice(0, 10);
    type Bin = { item_id: number; name: string; spot: string | null; assigned: boolean };
    const bins = async (): Promise<Bin[]> => ((await (await page.request.get(app('admin', `/guide/world?shelf=1&from=${today}`))).json()).shelf ?? []) as Bin[];
    const banded = (await bins()).filter((b) => b.assigned).sort((a, b) => a.name.localeCompare(b.name));
    test.skip(banded.length < 1, 'the shelf needs an item with a bin');

    await page.getByRole('button', { name: "See the shop's racks" }).click();
    await expect(page.getByTestId('shelf-placer')).toBeVisible({ timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'test-results/placer-1-open.png' });

    const choose = async (name: string) => {
        const input = page.getByTestId('shelf-placer-input');
        await input.click();
        await input.fill(name);
        await page.getByRole('option').filter({ hasText: name }).first().click();
        await expect(page.getByTestId('shelf-placer-hint')).toBeVisible();
    };
    const view = page.viewportSize()!;
    const tapRack = async () => {
        await page.mouse.click(view.width * 0.5, view.height * 0.4);
        await expect(page.getByTestId('shelf-placer-note')).toContainText(/is on [a-o]\d[a-d]/, { timeout: 30_000 });
        await page.waitForTimeout(1200);
    };

    await test.step('pick an item and tap a slot: its bin is recorded there', async () => {
        await choose(banded[0].name);
        await tapRack();
        await page.screenshot({ path: 'test-results/placer-2-placed.png' });
        const first = (await bins()).find((b) => b.item_id === banded[0].item_id)!;
        expect(first.spot).toMatch(/^[a-o]\d[a-d]$/);

        if (banded.length < 2) return;
        // A second item tapped onto the same slot takes it, and the first is moved (or left unplaced).
        await choose(banded[1].name);
        await tapRack();
        await page.screenshot({ path: 'test-results/placer-3-swapped.png' });
        const after = await bins();
        expect(after.find((b) => b.item_id === banded[1].item_id)!.spot).toBe(first.spot);
        expect(after.find((b) => b.item_id === banded[0].item_id)!.spot).not.toBe(first.spot);
        const held = after.filter((b) => b.spot).map((b) => b.spot);
        expect(new Set(held).size).toBe(held.length);
    });

    await test.step('lifting it off leaves the bin on the shelf with no slot', async () => {
        await choose(banded[0].name);
        const spot = (await bins()).find((b) => b.item_id === banded[0].item_id)!.spot;
        if (spot) {
            await page.getByRole('button', { name: 'Lift off' }).click();
            await expect(page.getByTestId('shelf-placer-note')).toContainText('off its slot', { timeout: 30_000 });
            expect((await bins()).find((b) => b.item_id === banded[0].item_id)!.spot).toBeNull();
        }
    });

    expect(errors).toEqual([]);
});
