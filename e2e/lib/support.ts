import { readFileSync } from 'node:fs';
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

export interface Person {
    id: number;
    email: string;
    name: string;
}

/** Written by `php artisan e2e:prepare` (./deploy/dev.sh e2e). */
export interface Fixture {
    password: string;
    store: { id: number; name: string };
    /** A free car for the staff transport spec. */
    vehicle: { id: number; name: string; plate: string };
    seller: { id: number; email: string; name: string };
    manager: { id: number; email: string; name: string };
    courier: { id: number; email: string; name: string };
    keeper: { id: number; email: string; name: string };
    account: { id: number; number: string };
    /** Where sellers hand cash over; the manager owns it. */
    settlement: { id: number; number: string };
    /** variant: the one the add-to-cart sheet starts on. */
    items: Array<{ item_id: number; name: string; variants: number; variant: number }>;
    /** Stock location ids, for checking the ledger (lib/inspect.ts). */
    locations: Record<'shelf' | 'floor' | 'remoteHub' | 'hub' | 'transit', number>;
    /** Priced in the store, but nothing on its shelf, floor or Remote Hub. */
    noStockItem: { item_id: number; name: string; variants: number };
    /** Everyone else, one per user type (see PrepareE2eCommand). */
    people: Record<'seller2' | 'admin' | 'storeAdmin' | 'hubKeeper' | 'finance' | 'procurement' | 'marketing' | 'vendor' | 'dev' | 'shared' | 'manager2' | 'keeper2' | 'procurement2', Person>;
    hub: { id: number; name: string };
    remoteHub: { id: number; name: string };
    /** Twenty units seeded in the Remote Hub: the transfer, receiving and stocktake specs all draw on them. */
    remoteVariant: { id: number; sku: string; item: string; quantity: number };
    /** No stock on the shelf or floor, at least 5 in the Remote Hub; its empty shelf bin wants 2. */
    refillItem: { item_id: number; name: string; variant: number; sku: string };
    /** A variant the main hub holds; label is what the admin's manifest picker shows. */
    hubVariant: { id: number; quantity: number; label: string; sku: string };
    /** A shipment scheduled from the main hub to the Remote Hub on the E2E van, nothing picked: the Guide world's freight car loads it. */
    playLoad: { id: number; reference: string; variant: number; quantity: number } | null;
    /** individual has a TIN; priced is a business with its own customer price; business has none. */
    customers: Record<'individual' | 'priced' | 'business', { id: number; name: string; phone: string; tin: string | null }>;
    /** Store price with a discount still running (running) or already over (expired); no other levels. */
    discounts: Record<'running' | 'expired', { item_id: number; name: string; price: number; discount_price: number; discount_ends_at: string }>;
    /** A stocked item with a known price at every level of the ladder. */
    /** Only a store price (30); the admin pricing spec sets the other levels. */
    adminPriced: { item_id: number; name: string; price: number; variants: Array<{ id: number; sku: string }> };
    priceItem: { item_id: number; name: string; variants: number; prices: Record<'store' | 'individual' | 'sellerIndividual' | 'sellerBusiness' | 'customer', number> };
}

// E2E_FIXTURE: another fixture file, e.g. make walkthrough's demo staff on dev (e2e/.fixture/demo.json).
const fixtureFile = process.env.E2E_FIXTURE ? new URL(`file://${process.env.E2E_FIXTURE}`) : new URL('../.fixture/fixture.json', import.meta.url);
export const fixture: Fixture = JSON.parse(readFileSync(fixtureFile, 'utf8'));

const port = process.env.E2E_PORT ?? '8096';

/** The URL of a path on one of the role apps, e.g. app('seller', '/carts'). */
export type Subdomain = 'admin' | 'seller' | 'delivery' | 'stockkeeper' | 'finance' | 'procurement' | 'marketing' | 'vendor' | 'dev' | 'shared';

export const app = (subdomain: Subdomain, path = '/'): string => `http://${subdomain}.duka.test:${port}${path}`;

/**
 * A signed-in page on a role app, in its own browser context so each person
 * (seller, manager, courier, stock keeper) keeps their own session.
 */
/** Every window signIn or labelWindow opened, so closeWindows() can shut them all. */
const opened = new Set<BrowserContext>();

/**
 * Closes every window this file's tests opened. The browser lives for the whole run, so
 * windows left open pile up from one test file to the next (make walkthrough: dozens of
 * windows, each recording a replay, and the Mac runs out of memory).
 */
export async function closeWindows(): Promise<void> {
    await Promise.all([...opened].map((context) => context.close().catch(() => undefined)));
    opened.clear();
}

export async function signIn(browser: Browser, subdomain: Subdomain, email: string): Promise<Page> {
    const context = await browser.newContext({ baseURL: app(subdomain) });
    opened.add(context);
    // The dev server (make walkthrough) shows Laravel Debugbar pinned to the bottom, over a
    // phone's sheet buttons; clicks there would wait forever. The e2e copy has no bar.
    await context.addInitScript(() => {
        document.addEventListener('DOMContentLoaded', () => {
            const style = document.createElement('style');
            style.textContent = '.phpdebugbar { display: none !important; }';
            document.head.append(style);
        });
    });
    if (process.env.WALKTHROUGH === '1') {
        await labelWindow(context, `${personNamed(email)} · ${APP_NAMES[subdomain]}`, APP_COLOURS[subdomain]);
    }
    const page = await context.newPage();

    // Vite compiles a role's login page on first hit, so a cold page can hydrate after the
    // first fill and wipe it. Retry the whole sign-in until the app takes us past /login.
    await expect(async () => {
        await page.goto(app(subdomain, '/login'));
        // A slow first login can finish between retries; /login then sends a signed-in user on.
        if (!/\/login/.test(page.url())) return;
        await page.locator('input[type="email"]').fill(email);
        await page.locator('input[type="password"]').fill(fixture.password);
        await page.getByRole('button', { name: 'Log in' }).click();
        await expect(page).not.toHaveURL(/\/login/, { timeout: 8_000 });
    }).toPass({ timeout: 60_000 });

    return page;
}

const APP_NAMES: Record<Subdomain, string> = {
    admin: 'Admin app', seller: 'Seller app', delivery: 'Delivery app', stockkeeper: 'Stock keeper app', finance: 'Finance app',
    procurement: 'Procurement app', marketing: 'Marketing app', vendor: 'Vendor app', dev: 'Dev app', shared: 'Shared app',
};
const APP_COLOURS: Record<Subdomain, string> = {
    admin: '#1e3a8a', seller: '#b45309', delivery: '#6d28d9', stockkeeper: '#047857', finance: '#0e7490',
    procurement: '#9d174d', marketing: '#be123c', vendor: '#4d7c0f', dev: '#374151', shared: '#0f766e',
};

/** The fixture person with this email ("Demo Courier"), or the email itself. */
function personNamed(email: string): string {
    const people = [fixture.seller, fixture.manager, fixture.keeper, fixture.courier, ...Object.values(fixture.people ?? {})];

    return people.find((person) => person?.email === email)?.name ?? email;
}

/**
 * make walkthrough: a band across the top of every page in this window, and the tab title,
 * saying whose screen it is ("Demo Courier · Delivery app"). It ignores the mouse, so it never
 * gets in the way of a click; it shows in the live windows, the UI mode and the replays.
 */
export async function labelWindow(context: BrowserContext, label: string, colour = '#111827'): Promise<void> {
    opened.add(context);
    await context.addInitScript(({ label, colour }) => {
        const put = () => {
            if (!document.body || document.getElementById('walkthrough-label')) return;
            const band = document.createElement('div');
            band.id = 'walkthrough-label';
            band.textContent = label;
            band.setAttribute('aria-hidden', 'true');
            band.style.cssText = `position:fixed;top:0;left:0;right:0;z-index:2147483647;pointer-events:none;background:${colour};color:#fff;font:600 13px/22px system-ui,sans-serif;text-align:center;opacity:.92`;
            document.body.append(band);
        };
        const title = () => {
            if (!document.title.startsWith(label)) document.title = `${label} — ${document.title}`;
        };
        document.addEventListener('DOMContentLoaded', () => {
            // A guest or customer window does not come through signIn, which hides the dev
            // server's Debugbar: hide it here too, or it covers the page's buttons.
            const style = document.createElement('style');
            style.textContent = '.phpdebugbar { display: none !important; }';
            document.head.append(style);
            put();
            title();
            // Inertia swaps the page and its title without a reload.
            new MutationObserver(() => {
                put();
                title();
            }).observe(document.documentElement, { childList: true, subtree: true });
        });
    }, { label, colour });
}

/** Inertia's flash message, wherever the layout shows it. */
export const flash = (page: Page, text: string | RegExp) => page.getByText(text).first();
