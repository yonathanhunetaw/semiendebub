import { expect, test } from '@playwright/test';
import { pngFile } from '../lib/files';
import { closeWindows, fixture, flash, signIn } from '../lib/support';

/**
 * Staff transport: the manager asks for a ride home for the seller; the courier
 * (a driver) takes it in the E2E van, sets off, drops the seller and finishes,
 * then records the fuel it took with a photo of the receipt, which Finance opens and confirms as an expense.
 */

test.afterAll(closeWindows);

test('a ride home: asked for, taken with a free car, driven and done', async ({ browser }) => {
    test.setTimeout(240_000);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const departs = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}T19:15`;

    // ── The seller says where they get dropped ──
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    await seller.goto('/work?tab=rides');
    await seller.getByPlaceholder(/Area or landmark/).fill('E2E Bole Bulbula');
    await seller.getByRole('button', { name: 'Save', exact: true }).last().click();
    await expect(flash(seller, /Staff transport drops you there/)).toBeVisible();

    // ── The manager asks for the ride ──
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await manager.goto('/work/rides');
    await manager.locator('input[type="datetime-local"]').fill(departs);
    // Whoever is still clocked in comes pre-ticked; this ride is for the seller alone.
    const rider = `${fixture.seller.name} · E2E Bole Bulbula`;
    const riders = manager.locator('form, section').filter({ hasText: 'Who rides' }).last().getByRole('checkbox', { checked: true });
    while ((await riders.count()) > 0) await riders.first().uncheck();
    await manager.getByRole('checkbox', { name: rider }).check();
    await manager.getByRole('button', { name: 'Ask for the ride' }).click();
    await expect(flash(manager, /Ride asked for/)).toBeVisible();

    // ── The courier takes it with the E2E van and drives it ──
    const courier = await signIn(browser, 'delivery', fixture.courier.email);
    await courier.goto('/work/rides');
    const card = courier.locator('section').filter({ hasText: 'E2E Bole Bulbula' }).first();
    await card.locator('select').selectOption({ label: `${fixture.vehicle.name} · ${fixture.vehicle.plate}` });
    await card.getByRole('button', { name: 'Take ride' }).click();
    await expect(flash(courier, /Ride is yours/)).toBeVisible();

    await courier.getByRole('button', { name: 'Set off' }).click();
    await expect(flash(courier, 'On the way.')).toBeVisible();
    await courier.getByRole('button', { name: 'Dropped' }).click();
    await expect(flash(courier, 'Dropped off.')).toBeVisible();
    await courier.getByRole('button', { name: 'Finish' }).click();
    await expect(flash(courier, 'Ride done.')).toBeVisible();

    // ── The fuel goes to Finance, who confirms it ──
    await courier.getByPlaceholder('Amount (ETB)').fill('850');
    await courier.getByPlaceholder('Litres (optional)').fill('12.5');
    await courier.getByLabel('Receipt photo (optional)').setInputFiles(pngFile('fuel-receipt.png'));
    await courier.getByRole('button', { name: 'Record fuel' }).click();
    await expect(flash(courier, /Fuel recorded/)).toBeVisible();
    await expect(courier.getByText(/waiting for finance/)).toBeVisible();

    const finance = await signIn(browser, 'finance', fixture.people.finance.email);
    await finance.goto('/expenses');
    const fuel = finance.locator('li').filter({ hasText: 'Fuel · ETB 850.00' }).filter({ hasText: fixture.vehicle.plate });
    const receipt = await finance.request.get((await fuel.getByRole('link', { name: 'Receipt' }).getAttribute('href'))!);
    expect(receipt.headers()['content-type']).toContain('image/png');
    await fuel.getByRole('button', { name: 'Confirm' }).click();
    await expect(flash(finance, /Expense confirmed/)).toBeVisible();

    await courier.goto('/work/rides');

    await expect(courier.getByText(/confirmed by finance/).first()).toBeVisible();

    // ── The seller sees it done ──
    await seller.goto('/work/rides');
    await expect(seller.getByText('Done', { exact: true }).first()).toBeVisible();
});
