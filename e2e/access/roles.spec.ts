import { expect, request, test, type APIRequestContext } from '@playwright/test';
import { fixture, signIn, type Subdomain } from '../lib/support';

/**
 * Every user type and the apps it may use. Sessions are per host, and signing in on another
 * role's app logs you out there and sends you to your own (AuthenticatedSessionController).
 * Store managers have no app of their own: they work in the seller app, and on the admin app
 * only reach the refill approvals.
 */
const port = process.env.E2E_PORT ?? '8096';
const apps: Subdomain[] = ['admin', 'seller', 'stockkeeper', 'delivery', 'finance', 'procurement', 'marketing', 'vendor', 'dev', 'shared'];
const { people } = fixture;

const homes: Array<{ who: string; email: string; home: Subdomain }> = [
    { who: 'seller', email: fixture.seller.email, home: 'seller' },
    { who: 'second seller', email: people.seller2.email, home: 'seller' },
    { who: 'stock keeper', email: fixture.keeper.email, home: 'stockkeeper' },
    { who: 'hub keeper', email: people.hubKeeper.email, home: 'stockkeeper' },
    { who: 'courier', email: fixture.courier.email, home: 'delivery' },
    { who: 'global admin', email: people.admin.email, home: 'admin' },
    { who: 'store admin', email: people.storeAdmin.email, home: 'admin' },
    { who: 'finance', email: people.finance.email, home: 'finance' },
    { who: 'procurement', email: people.procurement.email, home: 'procurement' },
    { who: 'marketing', email: people.marketing.email, home: 'marketing' },
    { who: 'vendor', email: people.vendor.email, home: 'vendor' },
    { who: 'dev', email: people.dev.email, home: 'dev' },
    { who: 'shared', email: people.shared.email, home: 'shared' },
];

const host = (app: Subdomain) => `${app}.duka.test`;

/** Signs in over HTTP on `app`; returns where the login sent us and the client, still on `app`. */
async function login(app: Subdomain, email: string): Promise<{ to: string; client: APIRequestContext }> {
    const client = await request.newContext({ baseURL: `http://${host(app)}:${port}`, maxRedirects: 0 });
    await client.get('/login');
    const xsrf = decodeURIComponent((await client.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')?.value ?? '');
    const response = await client.post('/login', { form: { email, password: fixture.password }, headers: { 'X-XSRF-TOKEN': xsrf } });
    expect(response.status(), `login of ${email} on ${app}`).toBe(302);

    return { to: response.headers()['location'] ?? '', client };
}

for (const { who, email, home } of homes) {
    test(`${who}: works in the ${home} app and is sent home from every other app`, async () => {
        for (const app of apps) {
            const { to, client } = await login(app, email);
            expect(to, `${who} signing in on ${app}`).toContain(`${host(home)}:${port}/dashboard`);
            // Only at home does the session open the dashboard; elsewhere it was logged out.
            expect((await client.get('/dashboard')).status(), `${who}'s dashboard on ${app}`).toBe(app === home ? 200 : 302);
            await client.dispose();
        }
    });
}

for (const manager of [fixture.manager.email, people.manager2.email]) {
    test(`store manager ${manager}: the seller app and the admin refill approvals, nothing else`, async () => {
        for (const app of apps) {
            const { to, client } = await login(app, manager);
            // No app of their own: they stay where they signed in; on admin, at the approvals.
            expect(to).toContain(`${host(app)}:${port}${app === 'admin' ? '/inventory/replenishment' : '/dashboard'}`);
            expect((await client.get('/dashboard')).status(), `manager's dashboard on ${app}`).toBe(app === 'seller' ? 200 : 403);
            if (app === 'admin') {
                expect((await client.get('/inventory/replenishment')).status(), 'refill approvals on admin').toBe(200);
                expect((await client.get('/inventory/counts')).status(), 'count approvals on admin').toBe(200);
            }
            await client.dispose();
        }
    });
}

test('a store admin is kept out of the global-only admin screens a global admin can open', async () => {
    const global = (await login('admin', people.admin.email)).client;
    const store = (await login('admin', people.storeAdmin.email)).client;

    for (const path of ['/inventory/shipments', '/users']) {
        expect((await global.get(path)).status(), `global admin on ${path}`).toBe(200);
    }
    expect((await store.get('/users')).status(), 'store admin on /users').toBe(403);
});

for (const { who, email, home } of homes) {
    test(`${who}: the ${home} dashboard renders in the browser`, async ({ browser }) => {
        const page = await signIn(browser, home, email);
        await expect(page).toHaveURL(/\/dashboard/);
        await expect(page.locator('body')).not.toContainText(/Server Error|Internal Server Error|Whoops|vite.*error/i);
    });
}
