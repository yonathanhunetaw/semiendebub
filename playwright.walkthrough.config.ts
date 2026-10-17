import { defineConfig, devices } from '@playwright/test';

/**
 * make walkthrough: the real sale flow on the DEV database (not the e2e copy), in a visible,
 * slowed-down browser, with demo staff from `php artisan dev:demo-staff`. Everything it
 * creates stays, so you can open it afterwards in each app. Needs `make dev` running.
 *
 *   make walkthrough [ARGS=shipment]       run them (one: part of its file name)
 *   make walkthrough-ui [ARGS=shipment]    Playwright's UI: the steps on the left, every screen
 *   make walkthrough-report                the last run's replay: steps, screenshots, traces
 */
process.env.E2E_PORT ??= '8095';
process.env.E2E_FIXTURE ??= `${process.cwd()}/e2e/.fixture/demo.json`;
// Labels each person's window (e2e/lib/support.ts signIn); the e2e runs have no labels.
process.env.WALKTHROUGH = '1';

export default defineConfig({
    testDir: './e2e/walkthrough',
    timeout: Number(process.env.WALKTHROUGH_TIMEOUT ?? 300_000),
    expect: { timeout: 20_000 },
    workers: 1,
    retries: 0,
    // Replays of the last run, on this Mac only (both folders are git-ignored); each run replaces them.
    outputDir: 'test-results/walkthrough',
    reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report/walkthrough' }]],
    use: {
        baseURL: `http://duka.test:${process.env.E2E_PORT}`,
        // The seller app is a phone UI.
        ...devices['Pixel 7'],
        headless: false,
        launchOptions: { slowMo: Number(process.env.SLOW_MO ?? 500) },
        // A replay of every step (make walkthrough-report), whether it passed or not.
        trace: 'on',
        screenshot: 'on',
    },
    projects: [{ name: 'chromium' }],
});
