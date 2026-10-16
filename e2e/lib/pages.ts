import { expect, test, type ConsoleMessage, type Page } from '@playwright/test';
import { signIn, type Subdomain } from './support';

/**
 * Opens each page of an app as a signed-in person and collects what is wrong with it:
 * an error status, Laravel's error page, an uncaught JS error, a console error or a
 * request that failed on the server. Where the page lists records, it also opens the
 * first record (a link to `<path>/<id>`), so pages that take an id are covered too.
 *
 * Returns every fault found, so one run reports all broken pages at once.
 */
export async function sweep(page: Page, paths: string[], options: { details?: boolean } = {}): Promise<string[]> {
    const faults: string[] = [];
    let current = '';

    page.on('pageerror', (error) => faults.push(`${current}: uncaught ${error.message.split('\n')[0]}`));
    page.on('console', async (message) => {
        if (message.type() !== 'error' || ignored(message.text())) return;
        const at = current;
        faults.push(`${at}: console ${(await readable(message)).split('\n')[0].slice(0, 240)}`);
    });
    page.on('response', (response) => {
        if (response.status() >= 500) faults.push(`${current}: ${response.status()} from ${new URL(response.url()).pathname}`);
    });

    const visit = async (path: string): Promise<void> => {
        current = path;
        // A client-side visit still settling from the last page can abort the next load; try once more.
        const response = await page.goto(path).catch(() => page.goto(path));
        const status = response?.status() ?? 0;
        if (status >= 400) {
            faults.push(`${path}: HTTP ${status}`);
            return;
        }
        // Inertia mounts into #app; a blank page means the React page threw while rendering.
        await expect(page.locator('#app > *').first(), `${path} rendered`).toBeVisible({ timeout: 30_000 }).catch(() => faults.push(`${path}: nothing rendered`));
        await page.waitForLoadState('networkidle').catch(() => undefined);
        if (await page.getByText(/Server Error|Whoops|SQLSTATE|Undefined (array key|variable|property)/).first().isVisible().catch(() => false)) {
            faults.push(`${path}: error text on the page`);
        }
    };

    for (const path of paths) {
        await visit(path);

        if (options.details !== false) {
            const detail = await firstDetailLink(page, path);
            if (detail) await visit(detail);
        }
    }

    return faults;
}

/** The first link on the page to one record under `path`, e.g. /orders/42 on /orders. */
async function firstDetailLink(page: Page, path: string): Promise<string | null> {
    const base = path.replace(/\/$/, '');
    const hrefs = await page.locator('a[href]').evaluateAll((links) => links.map((a) => (a as HTMLAnchorElement).pathname));
    const pattern = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(?!create$|download$)[^/]+$`);

    return hrefs.find((href) => pattern.test(href)) ?? null;
}

/** React logs "Each child… %s"; fill the %s in from the arguments so the fault names the culprit. */
async function readable(message: ConsoleMessage): Promise<string> {
    const [format, ...args] = await Promise.all(message.args().map((arg) => arg.jsonValue().catch(() => '?')));
    if (typeof format !== 'string' || !format.includes('%s')) return message.text();
    let i = 0;

    return format.replace(/%s/g, () => String(args[i++] ?? '').trim());
}

/** Noise that is not a fault of the page: dev tooling and the browser itself. */
function ignored(text: string): boolean {
    return /\[vite\]|Download the React DevTools|favicon|ERR_BLOCKED_BY_CLIENT|net::ERR_ABORTED|net::ERR_NAME_NOT_RESOLVED/.test(text);
}

/** One test per person: every page of `subdomain` opens clean for them (`allowed`: faults a page shows on purpose). */
export function pagesTest(subdomain: Subdomain, who: string, email: string, paths: string[], allowed: RegExp[] = []): void {
    test(`${who}: every ${subdomain} page opens without errors`, async ({ browser }) => {
        test.setTimeout(paths.length * 30_000);
        const page = await signIn(browser, subdomain, email);
        const faults = (await sweep(page, paths)).filter((fault) => !allowed.some((allow) => allow.test(fault)));
        expect(faults, faults.join('\n')).toEqual([]);
    });
}
