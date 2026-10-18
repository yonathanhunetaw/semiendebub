import { expect, test } from '@playwright/test';
import { siteOf } from '../lib/inspect';
import { sweep } from '../lib/pages';
import { closeWindows, fixture, signIn, type Subdomain } from '../lib/support';

/**
 * Work (keys, opening and closing, rota, attendance, leave, rides): every page
 * opens clean on each app that has it.
 */

test.afterAll(closeWindows);

const site = () => siteOf(fixture.store.id);

test('store manager: every work page opens clean', async ({ browser }) => {
    test.setTimeout(240_000);
    const page = await signIn(browser, 'seller', fixture.manager.email);
    const id = site().id;

    const faults = await sweep(page, [
        '/work',
        '/work/sites',
        `/work/sites/${id}`,
        `/work/sites/${id}/rota`,
        `/work/sites/${id}/attendance`,
        `/work/sites/${id}/printed-qr`,
        '/work/team',
        '/work/rides',
        '/work/overtime',
        '/guide?chapter=work',
    ], { details: false });

    expect(faults, faults.join('\n')).toEqual([]);
});

const others: Array<[Subdomain, string, string[]]> = [
    ['stockkeeper', fixture.keeper.email, ['/work', '/work/rides']],
    ['delivery', fixture.courier.email, ['/work', '/work/rides']],
    ['admin', fixture.people.admin.email, ['/work', '/work/sites', '/work/overtime', '/inventory/fleet', '/expenses']],
    ['finance', fixture.people.finance.email, ['/expenses']],
];

for (const [subdomain, email, paths] of others) {
    test(`${subdomain}: work pages open clean`, async ({ browser }) => {
        test.setTimeout(180_000);
        const page = await signIn(browser, subdomain, email);
        const faults = await sweep(page, paths, { details: false });
        expect(faults, faults.join('\n')).toEqual([]);
    });
}
