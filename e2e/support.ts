import { readFileSync } from 'node:fs';
import { expect, type Browser, type Page } from '@playwright/test';

/** Written by `php artisan e2e:prepare` (./deploy/dev.sh e2e). */
export interface Fixture {
    password: string;
    store: { id: number; name: string };
    seller: { id: number; email: string; name: string };
    manager: { id: number; email: string; name: string };
    courier: { id: number; email: string; name: string };
    keeper: { id: number; email: string; name: string };
    account: { id: number; number: string };
    items: Array<{ item_id: number; name: string; variants: number }>;
}

export const fixture: Fixture = JSON.parse(readFileSync(new URL('./.fixture/fixture.json', import.meta.url), 'utf8'));

const port = process.env.E2E_PORT ?? '8096';

/** The URL of a path on one of the role apps, e.g. app('seller', '/carts'). */
export type Subdomain = 'seller' | 'delivery' | 'stockkeeper';

export const app = (subdomain: Subdomain, path = '/'): string => `http://${subdomain}.duka.test:${port}${path}`;

/**
 * A signed-in page on a role app, in its own browser context so each person
 * (seller, manager, courier, stock keeper) keeps their own session.
 */
export async function signIn(browser: Browser, subdomain: Subdomain, email: string): Promise<Page> {
    const context = await browser.newContext({ baseURL: app(subdomain) });
    const page = await context.newPage();

    await page.goto(app(subdomain, '/login'));
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(fixture.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).not.toHaveURL(/\/login/);

    return page;
}

/** Inertia's flash message, wherever the layout shows it. */
export const flash = (page: Page, text: string | RegExp) => page.getByText(text).first();
