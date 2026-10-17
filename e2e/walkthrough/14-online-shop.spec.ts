import { expect, test, type Page } from '@playwright/test';
import { labelWindow, closeWindows } from '../lib/support';

// One browser serves the whole run: close this file's windows when each test ends.
test.afterEach(closeWindows);

/**
 * The public online shop as a guest, on the dev server (make walkthrough): put an item in the
 * cart, take one more, take it out, add it again, and at checkout be sent to sign in with the
 * cart kept. Paying online is not built yet (Storefront\CartController::checkout says so), so
 * the journey stops at the sign-in and leaves nothing in the database but a guest session.
 */
const shop = `http://duka.test:${process.env.E2E_PORT ?? '8095'}`;

/** Opens shop items in turn until one can be added; returns its title. */
async function openStockedItem(page: Page): Promise<string> {
    await page.goto(`${shop}/shop`);
    const cards = page.getByRole('link', { name: /^View options for / });
    await expect(cards.first()).toBeVisible();
    const count = Math.min(await cards.count(), 12);

    for (let i = 0; i < count; i++) {
        await page.goto(`${shop}/shop`);
        const card = page.getByRole('link', { name: /^View options for / }).nth(i);
        const title = ((await card.getAttribute('aria-label')) ?? '').replace('View options for ', '');
        await card.click();
        const add = page.getByRole('button', { name: 'Add to Cart' });
        if (await add.isEnabled({ timeout: 10_000 }).catch(() => false)) return title;
    }
    throw new Error(`None of the first ${count} shop items could be added to a cart`);
}

/** Adding opens the cart by itself; open it from the header only when it is closed. */
async function openCart(page: Page, items: number): Promise<void> {
    const checkout = page.getByRole('button', { name: 'Proceed to Checkout' });
    if (!(await checkout.isVisible())) await page.getByRole('button', { name: new RegExp(`^Open cart, ${items} item`) }).click();
    await expect(checkout).toBeVisible();
}

test('online shop: a guest fills a cart, changes it, and checking out asks them to sign in', async ({ browser }) => {
    const context = await browser.newContext();
    await labelWindow(context, 'A guest on the online shop, not signed in', '#4338ca');
    const page = await context.newPage();

    const title = await test.step('1. the guest finds an item in stock and adds it', async () => {
        const found = await openStockedItem(page);
        await page.getByRole('button', { name: 'Add to Cart' }).click();
        await expect(page.getByText('Added to your cart.').first()).toBeVisible();
        await openCart(page, 1);

        return found;
    });

    await test.step('2. one more, then take it out of the cart', async () => {
        await expect(page.getByText(title).last()).toBeVisible();
        await page.getByRole('button', { name: /^Increase quantity of / }).first().click();
        await expect(page.getByText('Subtotal (2 items)')).toBeVisible();
        await page.getByRole('button', { name: /^Remove .* from cart$/ }).first().click();
        await expect(page.getByText('Removed from your cart.').first()).toBeVisible();
    });

    await test.step('3. add it again; the cart survives a reload; checkout asks them to sign in', async () => {
        await page.getByRole('button', { name: 'Close cart' }).click().catch(() => undefined);
        await page.getByRole('button', { name: 'Add to Cart' }).click();
        await expect(page.getByText('Added to your cart.').first()).toBeVisible();
        await page.reload();
        await openCart(page, 1);
        await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
        await expect(page).toHaveURL(/\/login/);
        await expect(page.getByText('Sign in to complete your order — your cart has been saved.')).toBeVisible();
    });

    console.log(`
  Walkthrough done: a guest put "${title}" in the cart and was sent to sign in at checkout.
  Paying online is not built yet, so no order was made. See the shop yourself: ${shop}/shop
`);
});
