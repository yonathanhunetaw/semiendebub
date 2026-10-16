import { expect, type Locator, type Page } from '@playwright/test';
import { app, fixture } from './support';

/**
 * Transfers between places, as the stock keeper and the courier work them. A transfer that
 * leaves the site goes: raised → claimed → handed to the courier → handed over → received.
 */

/**
 * Picks the option of a native select whose text matches, in the fixture's store when one
 * of its places matches: other stores (one admin/settings adds) have a Store Floor too.
 */
export async function choose(select: Locator, text: RegExp): Promise<void> {
    const options = await select.locator('option').allTextContents();
    const label = options.find((o) => text.test(o) && o.includes(fixture.store.name)) ?? options.find((o) => text.test(o));
    if (!label) throw new Error(`No option matching ${text} in: ${options.join(' | ')}`);
    await select.selectOption({ label });
}

/** The card of transfer `reference`: the nearest ancestor of its reference that holds buttons and no other transfer. */
export const cardOf = (page: Page, reference: string) =>
    page.getByText(reference).first().locator(`xpath=ancestor::*[.//button][count(.//*[starts-with(normalize-space(text()), 'TRF-')]) = 1][last()]`);

/** Raises a transfer of the seeded variant on the keeper's Transfers page and returns its reference (none when refused). */
export async function raiseTransfer(keeper: Page, from: RegExp, to: RegExp, units: number, item = fixture.remoteVariant.item): Promise<string | undefined> {
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

/** The courier claims the transfer from the pool. */
export async function claim(courier: Page, reference: string): Promise<void> {
    await courier.goto(app('delivery', '/transfers'));
    await cardOf(courier, reference).getByRole('button', { name: 'Claim' }).click();
    await courier.goto(app('delivery', '/transfers?tab=mine'));
    await expect(courier.getByText(reference)).toBeVisible();
}

/** The keeper at the origin hands it to the courier: it leaves the origin for the courier's custody. */
export async function handToCourier(keeper: Page, reference: string): Promise<void> {
    await keeper.goto(app('stockkeeper', '/transfers'));
    await cardOf(keeper, reference).getByRole('button', { name: 'Hand to courier' }).click();
    await expect(cardOf(keeper, reference).getByRole('button', { name: 'Receive' })).toBeVisible();
}

/** The courier hands it over at the destination; it stays theirs until it is received. */
export async function handOver(courier: Page, reference: string): Promise<void> {
    await courier.goto(app('delivery', '/transfers?tab=mine'));
    await cardOf(courier, reference).getByRole('button', { name: 'Hand over' }).click();
    await expect(courier.getByText('Handed over — the store checks and receives it')).toBeVisible();
}

/**
 * The keeper at the destination counts it in. Leave `count` out to take what was sent;
 * give `arrived` (and `damaged`, part of what arrived) when it differs.
 */
export async function receive(keeper: Page, reference: string, count: { sent?: number; arrived?: number; damaged?: number } = {}): Promise<void> {
    await keeper.goto(app('stockkeeper', '/transfers'));
    await cardOf(keeper, reference).getByRole('button', { name: 'Receive' }).click();

    const sheet = keeper.getByRole('heading', { name: `Receive ${reference}` }).locator('xpath=ancestor::*[.//button[@type="submit"]][1]');
    const [arrived, damaged] = [sheet.locator('input[type="number"]').nth(0), sheet.locator('input[type="number"]').nth(1)];
    if (count.sent !== undefined) await expect(arrived).toHaveValue(String(count.sent));
    if (count.arrived !== undefined) await arrived.fill(String(count.arrived));
    if (count.damaged !== undefined) await damaged.fill(String(count.damaged));
    await sheet.getByRole('button', { name: 'Receive', exact: true }).click();

    // A finished card has no buttons, so find it as its list item.
    await expect(keeper.locator('li').filter({ hasText: reference })).toContainText('Completed');
}
