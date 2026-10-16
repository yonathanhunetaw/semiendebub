import { readFileSync } from 'node:fs';
import { expect, type Browser, type Page } from '@playwright/test';

export interface Person {
    id: number;
    email: string;
    name: string;
}

/** Written by `php artisan e2e:prepare` (./deploy/dev.sh e2e). */
export interface Fixture {
    password: string;
    store: { id: number; name: string };
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
    /** individual has a TIN; priced is a business with its own customer price; business has none. */
    customers: Record<'individual' | 'priced' | 'business', { id: number; name: string; phone: string; tin: string | null }>;
    /** Store price with a discount still running (running) or already over (expired); no other levels. */
    discounts: Record<'running' | 'expired', { item_id: number; name: string; price: number; discount_price: number; discount_ends_at: string }>;
    /** A stocked item with a known price at every level of the ladder. */
    /** Only a store price (30); the admin pricing spec sets the other levels. */
    adminPriced: { item_id: number; name: string; price: number; variants: Array<{ id: number; sku: string }> };
    priceItem: { item_id: number; name: string; variants: number; prices: Record<'store' | 'individual' | 'sellerIndividual' | 'sellerBusiness' | 'customer', number> };
}

export const fixture: Fixture = JSON.parse(readFileSync(new URL('../.fixture/fixture.json', import.meta.url), 'utf8'));

const port = process.env.E2E_PORT ?? '8096';

/** The URL of a path on one of the role apps, e.g. app('seller', '/carts'). */
export type Subdomain = 'admin' | 'seller' | 'delivery' | 'stockkeeper' | 'finance' | 'procurement' | 'marketing' | 'vendor' | 'dev' | 'shared';

export const app = (subdomain: Subdomain, path = '/'): string => `http://${subdomain}.duka.test:${port}${path}`;

/**
 * A signed-in page on a role app, in its own browser context so each person
 * (seller, manager, courier, stock keeper) keeps their own session.
 */
export async function signIn(browser: Browser, subdomain: Subdomain, email: string): Promise<Page> {
    const context = await browser.newContext({ baseURL: app(subdomain) });
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

/** Inertia's flash message, wherever the layout shows it. */
export const flash = (page: Page, text: string | RegExp) => page.getByText(text).first();
