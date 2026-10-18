import { expect, test, type Page } from '@playwright/test';
import { siteOf } from '../lib/inspect';
import { closeWindows, fixture, flash, signIn } from '../lib/support';

/**
 * One working day at the store, across four people:
 *   the manager gives the key to Seller Two and puts both sellers on today's rota;
 *   each accepts their shift; Seller Two hands the key to the seller, who accepts it;
 *   the seller opens with the printed QR; Seller Two clocks in with the counter's
 *   moving code and takes a break; the seller closes, clocking Seller Two out and
 *   handing them the key, which they accept.
 */

test.afterAll(closeWindows);

const today = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** "HH:mm" an offset of hours from now, kept inside today. */
const at = (hours: number): string => {
    const d = new Date(Date.now() + hours * 3_600_000);
    if (d.getDate() !== new Date().getDate()) return hours < 0 ? '00:01' : '23:58';
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

async function addShift(page: Page, name: string, from: string, to: string): Promise<void> {
    const day = page.locator(`section[data-date="${today()}"]`);
    await day.getByRole('button', { name: '+ Add shift' }).click();
    await day.locator('select').first().selectOption({ label: name });
    const times = day.locator('input[type="time"]');
    await times.nth(0).fill(from);
    await times.nth(1).fill(to);
    await day.getByRole('button', { name: 'Add shift', exact: true }).click();
    await expect(flash(page, /Shift added/)).toBeVisible();
}

test('a day: key, rota, open with the QR, clock in, break, close and hand the key on', async ({ browser }) => {
    test.setTimeout(300_000);
    const id = siteOf(fixture.store.id).id;
    const seller = fixture.seller;
    const two = fixture.people.seller2;

    // ── The manager: the key to Seller Two, both sellers on today's rota ──
    const manager = await signIn(browser, 'seller', fixture.manager.email);
    await manager.goto(`/work/sites/${id}`);
    await manager.getByRole('button', { name: /^Give (the key|to someone)$/ }).first().click();
    await manager.locator('select').filter({ hasText: 'Give the key to…' }).selectOption({ label: two.name });
    await manager.getByPlaceholder('Why without the holder? (required)').fill('E2E: first holder');
    await manager.getByRole('button', { name: 'Give key' }).click();
    await expect(flash(manager, /holds the key now/)).toBeVisible();

    await manager.goto(`/work/sites/${id}/rota?week=${today()}`);
    // Around now, so both are still on in My work and the clock-ins land on them.
    const one = [at(-1), at(6)];
    const other = [at(-0.5), at(7)];
    await addShift(manager, seller.name, one[0], one[1]);
    await addShift(manager, two.name, other[0], other[1]);
    await manager.getByRole('button', { name: /^Publish \d+ drafts?$/ }).click();
    await expect(flash(manager, /shift\(s\) sent/)).toBeVisible();

    // ── Each accepts their shift ──
    const first = await signIn(browser, 'seller', seller.email);
    await first.goto('/work');
    await first.locator('[data-shift]').filter({ hasText: `${one[0]}–${one[1]}` }).getByRole('button', { name: 'Accept' }).click();
    await expect(flash(first, 'Shift accepted.')).toBeVisible();

    const second = await signIn(browser, 'seller', two.email);
    await second.goto('/work');
    await second.locator('[data-shift]').filter({ hasText: `${other[0]}–${other[1]}` }).getByRole('button', { name: 'Accept' }).click();
    await expect(flash(second, 'Shift accepted.')).toBeVisible();

    // ── Seller Two hands the key to the seller; it is theirs once they accept ──
    await second.getByRole('button', { name: 'Hand over', exact: true }).first().click();
    await second.locator('select').filter({ hasText: 'Hand it to…' }).selectOption({ label: seller.name });
    await second.getByRole('button', { name: 'Hand over', exact: true }).click();
    await expect(flash(second, /Handed to/)).toBeVisible();
    expect(siteOf(fixture.store.id).key_holder).toBe(two.id);

    await first.goto('/work');
    await first.getByRole('button', { name: 'I have it' }).click();
    await expect(flash(first, 'You hold the key now.')).toBeVisible();
    expect(siteOf(fixture.store.id).key_holder).toBe(seller.id);

    // ── The seller opens with the printed QR ──
    await first.goto(siteOf(fixture.store.id).printed);
    await first.getByLabel('Cash float counted').check();
    await first.getByPlaceholder('Cash float in the till (ETB)').fill('500');
    await first.getByRole('button', { name: /^Open / }).click();
    await expect(flash(first, /is open\./)).toBeVisible();
    expect(siteOf(fixture.store.id).status).toBe('open');
    expect(siteOf(fixture.store.id).clocked_in).toContain(seller.id);

    // ── Seller Two clocks in with the counter's moving code, takes a break ──
    await second.goto(siteOf(fixture.store.id).live);
    await second.getByRole('button', { name: 'Clock in' }).click();
    await expect(flash(second, /Clocked in at/)).toBeVisible();

    await second.goto('/work');
    await second.getByRole('button', { name: 'Start a break' }).click();
    await expect(flash(second, /On a break/)).toBeVisible();
    await second.getByRole('button', { name: 'End break' }).click();
    await expect(flash(second, 'Back from the break.')).toBeVisible();

    // ── The seller closes: clocks Seller Two out, hands them the key ──
    await first.goto(siteOf(fixture.store.id).live);
    await first.getByLabel(/Clock them out as I close/).check();
    await first.locator('select').filter({ hasText: 'I keep the key' }).selectOption({ label: `Hand the key to ${two.name}` });
    await first.getByRole('button', { name: /^Close / }).click();
    await expect(flash(first, /is closed\. The key waits for/)).toBeVisible();

    const closed = siteOf(fixture.store.id);
    expect(closed.status).toBe('closed');
    expect(closed.clocked_in).toEqual([]);

    await second.goto('/work');
    await second.getByRole('button', { name: 'I have it' }).click();
    await expect(flash(second, 'You hold the key now.')).toBeVisible();
    expect(siteOf(fixture.store.id).key_holder).toBe(two.id);

    // ── The manager sees both on the attendance page ──
    await manager.goto(`/work/sites/${id}/attendance`);
    // Both clock-ins, each linked to the shift it covered.
    await expect(manager.getByRole('listitem').filter({ hasText: `${seller.name} ·` }).filter({ hasText: 'shift' }).first()).toBeVisible();
    await expect(manager.getByRole('listitem').filter({ hasText: `${two.name} ·` }).filter({ hasText: 'shift' }).first()).toBeVisible();
});
