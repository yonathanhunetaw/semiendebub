import { expect, test, type Page } from '@playwright/test';

/**
 * The public shop as a guest: put an item in the cart, change how many, take it out,
 * and at checkout be sent to sign in with the cart kept. Paying is not built yet
 * (Storefront\CartController::checkout says so), so the journey stops at the sign-in.
 */
const shop = `http://duka.test:${process.env.E2E_PORT ?? '8096'}`;

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

test('a guest fills a cart, changes it, empties it, and checking out asks them to sign in', async ({ page }) => {
    const title = await openStockedItem(page);

    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(page.getByText('Added to your cart.').first()).toBeVisible();
    await openCart(page, 1);

    await expect(page.getByText(title).last()).toBeVisible();
    await page.getByRole('button', { name: /^Increase quantity of / }).first().click();
    await expect(page.getByText('Subtotal (2 items)')).toBeVisible();

    await page.getByRole('button', { name: /^Remove .* from cart$/ }).first().click();
    await expect(page.getByText('Removed from your cart.').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Proceed to Checkout' })).toBeHidden();

    // Again, and on to checkout: a guest signs in first and keeps the cart.
    await page.getByRole('button', { name: 'Close cart' }).click().catch(() => undefined);
    await page.getByRole('button', { name: 'Add to Cart' }).click();
    await expect(page.getByText('Added to your cart.').first()).toBeVisible();
    // The cart was kept in the session: it is still there after a reload.
    await page.reload();
    await openCart(page, 1);
    await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Sign in to complete your order — your cart has been saved.')).toBeVisible();
});
