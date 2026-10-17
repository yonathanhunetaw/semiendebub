import { defineConfig, devices } from '@playwright/test';

/**
 * E2E tests run on the host through ./deploy/dev.sh e2e, which copies the dev DB to
 * duka_e2e, prepares test users (e2e:prepare) and serves it on :8096.
 * Keep ./deploy/dev.sh running in another terminal: its Vite serves the assets.
 */
const port = process.env.E2E_PORT ?? '8096';

export default defineConfig({
    testDir: './e2e',
    // make walkthrough runs these on the real dev database, never with make e2e.
    testIgnore: 'walkthrough/**',
    // Vite dev compiles on first hit; a cold page can take 30s+.
    timeout: 90_000,
    expect: { timeout: 15_000 },
    // The order flow is one story across apps; run specs one at a time.
    fullyParallel: false,
    workers: 1,
    forbidOnly: !!process.env.CI,
    retries: 0,
    reporter: [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: `http://duka.test:${port}`,
        // The seller app is a phone UI.
        ...devices['Pixel 7'],
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium' }],
});
