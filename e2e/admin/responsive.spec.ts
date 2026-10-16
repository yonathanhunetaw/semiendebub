import { mkdirSync, writeFileSync } from 'node:fs';
import { test } from '@playwright/test';
import { fixture, signIn } from '../lib/support';

/**
 * Every admin page at phone, tablet and desktop width: reports sideways overflow
 * (the page or an element wider than the screen) and saves a screenshot of each
 * view. Not a pass/fail gate; it writes a report to e2e/.fixture/responsive/.
 */
const store = ['/dashboard', '/settings', '/orders', '/carts', '/carts/create', '/deliveries',
    '/payments', '/payment-accounts', '/balances', '/credit', '/customers', '/customers/discounts',
    '/inventory', '/inventory/replenish', '/inventory/replenishment', '/inventory/transfers', '/inventory/transfers/create',
    '/inventory/locations', '/inventory/capacity', '/canvas'];
const globalOnly = ['/system', '/stores', '/items', '/items/create', '/stores/create', '/users', '/users/create', '/sessions',
    '/inventory/shipments', '/inventory/stores', '/inventory/fleet', '/inventory/warehouse', '/inventory/warehouse/create'];

const VIEWS = [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 820, height: 1180 },
    { name: 'desktop', width: 1440, height: 900 },
];

test('admin pages fit phone, tablet and desktop', async ({ browser }) => {
    const paths = [...store, ...globalOnly];
    test.setTimeout(paths.length * VIEWS.length * 20_000);
    const dir = new URL('../.fixture/responsive/', import.meta.url).pathname;
    mkdirSync(dir, { recursive: true });

    const page = await signIn(browser, 'admin', fixture.people.admin.email);
    const rows: string[] = [];

    for (const path of paths) {
        for (const view of VIEWS) {
            await page.setViewportSize({ width: view.width, height: view.height });
            await page.goto(path).catch(() => page.goto(path));
            await page.waitForLoadState('networkidle').catch(() => undefined);
            await page.waitForTimeout(500);

            const result = await page.evaluate((vw) => {
                const doc = document.documentElement;
                const wide = [...document.querySelectorAll('main *')]
                    .filter((el) => {
                        const r = el.getBoundingClientRect();
                        const style = getComputedStyle(el);
                        return r.width > 0 && r.right > vw + 2 && style.position !== 'fixed' && !el.closest('[class*="MuiDrawer"],[role="presentation"]');
                    })
                    .slice(0, 3)
                    .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').filter((c) => !c.startsWith('css-')).slice(0, 2).join('.') : ''}(${Math.round(el.getBoundingClientRect().right)})`);

                return { scroll: doc.scrollWidth, wide };
            }, view.width);

            const over = result.scroll - view.width;
            rows.push(`${view.name}\t${path}\t${over > 1 ? `OVERFLOW +${over}px` : 'ok'}\t${result.wide.join(' ')}`);
            await page.screenshot({ path: `${dir}${view.name}${path.replace(/\//g, '_')}.png` });
        }
        writeFileSync(`${dir}report.tsv`, rows.join('\n'));
    }
});
