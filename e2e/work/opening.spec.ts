import { expect, test } from '@playwright/test';
import { siteOf } from '../lib/inspect';
import { closeWindows, fixture, flash, signIn } from '../lib/support';

/**
 * Who opens, closes and drives, planned in one place (Shifts and opening, the Rota page):
 *   the manager names tomorrow's opener, closer and driver; the plan makes the driver's
 *   two runs (the opener's pick-up 45 min before opening, the closer's ride home at closing);
 *   the courier sees them in My work → Shifts ("Coming up", tomorrow's job with both runs), the
 *   opener sees their own job there and the pick-up in My work → Rides; the courier takes
 *   the pick-up with the van; taking the driver off calls the runs off.
 * The store is open every day 07:00–21:00 (e2e:prepare).
 */

test.afterAll(closeWindows);

const dayFromNow = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test('tomorrow’s opener, closer and driver: the driver’s runs follow the plan', async ({ browser }) => {
    test.setTimeout(240_000);
    const id = siteOf(fixture.store.id).id;
    const date = dayFromNow(1);
    const opener = fixture.seller;
    const closer = fixture.people.seller2;
    const courier = fixture.courier;

    const manager = await signIn(browser, 'seller', fixture.manager.email);

    await test.step('My work has the five tabs, and Shifts leads a manager to their sites', async () => {
        await manager.goto('/work');
        for (const tab of ['Today', 'Shifts', 'Keys', 'Leave', 'Rides']) {
            await expect(manager.getByRole('tab', { name: new RegExp(`^${tab}`) })).toBeVisible();
        }
        await manager.getByRole('tab', { name: /^Shifts/ }).click();
        await expect(manager).toHaveURL(/tab=shifts/);
        await expect(manager.getByRole('link', { name: 'Shifts and opening' }).first()).toBeVisible();
    });

    const day = manager.locator(`section[data-date="${date}"]`);
    /** Each choice saves at once; the next one waits until the dropdowns are free again. Names carry their role ("Ana · seller"). */
    const plan = async (field: 'Opens' | 'Closes' | 'Drives', label: string) => {
        const select = day.getByLabel(`${field} ${date}`);
        const option = select.locator('option').filter({ hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( · .+)?$`) }).first();
        await select.selectOption((await option.getAttribute('value')) ?? '');
        await expect(flash(manager, 'Who opens, closes and drives: saved.')).toBeVisible();
        await expect(select).toBeEnabled();
    };

    await test.step('the manager plans tomorrow on Shifts and opening', async () => {
        await manager.goto(`/work/sites/${id}/rota?week=${date}`);
        // The database is a copy of dev, where someone may have planned tomorrow already: start from no driver.
        if ((await day.getByLabel(`Drives ${date}`).inputValue()) !== '') {
            await plan('Drives', 'No driver');
        }
        await expect(day.getByText(/No driver: the opener comes on their own/)).toBeVisible();
        await plan('Opens', opener.name);
        await plan('Closes', closer.name);
        await plan('Drives', courier.name);
        await expect(day.getByText('Picks up the opener 06:15 · Takes the closer home 21:00')).toBeVisible();
    });

    const driver = await signIn(browser, 'delivery', courier.email);

    await test.step('the courier sees tomorrow’s job with both runs in My work → Shifts', async () => {
        await driver.goto('/work?tab=shifts');
        await expect(driver.getByRole('heading', { name: /Coming up: you open, close or drive/ })).toBeVisible();
        const job = driver.locator('section').filter({ hasText: 'You drive · ' }).first();
        await expect(job.getByText('Opening: bring the opener in')).toBeVisible();
        await expect(job.getByText('Closing: take the closer home')).toBeVisible();
    });

    await test.step('the opener sees their job (the key, then the QR) and the pick-up in My work → Rides', async () => {
        const seller = await signIn(browser, 'seller', opener.email);
        await seller.goto('/work?tab=shifts');
        const job = seller.locator('section').filter({ hasText: 'You open · ' });
        await expect(job.getByText(/scan the printed QR at the counter/)).toBeVisible();
        await job.getByRole('button', { name: 'Yes, I’ll do it' }).click();
        await expect(flash(seller, /the manager sees you will do it/)).toBeVisible();
        await expect(job.getByText('✓ You said you will')).toBeVisible();
        await seller.goto('/work?tab=rides');
        await expect(seller.locator('section').filter({ hasText: 'Opening: bring the opener in' }).getByText(courier.name)).toBeVisible();
    });

    await test.step('the manager sees the yes on the Rota and in the week ahead', async () => {
        await manager.goto(`/work/sites/${id}/rota?week=${date}`);
        await expect(day.getByText(`✓ ${opener.name} opens: said yes`)).toBeVisible();
        await expect(day.getByText(`${closer.name} closes: not answered yet`)).toBeVisible();
    });

    await test.step('the courier takes the pick-up with the van', async () => {
        await driver.goto('/work/rides');
        // Only this test's run: the database copy can hold others (dev's own plans).
        const pickup = driver.locator('section').filter({ hasText: 'Opening: bring the opener in' }).filter({ hasText: opener.name }).first();
        await pickup.locator('select').selectOption({ label: `${fixture.vehicle.name} · ${fixture.vehicle.plate}` });
        await pickup.getByRole('button', { name: 'Take ride' }).click();
        await expect(flash(driver, /Ride is yours/)).toBeVisible();
    });

    await test.step('no driver: the runs are called off, the day says so', async () => {
        await plan('Drives', 'No driver');
        await expect(day.getByText(/No driver: the opener comes on their own/)).toBeVisible();

        await driver.goto('/work');
        await expect(driver.getByText('Opening: bring the opener in')).toHaveCount(0);
        await expect(driver.getByText('Closing: take the closer home')).toHaveCount(0);
    });
});
