import { expect, type Page } from '@playwright/test';
import { app, fixture } from './support';

/**
 * The steps every seller-side spec walks through, as the screens do them:
 * customers, carts, items, checkout, the manager's inbox and Pick & pack.
 */

// Unique per run: phone, email and TIN are unique on customers.
export const run = Date.now().toString().slice(-8);

export interface CustomerSpec {
    key: string;
    first: string;
    last: string;
    phone: string;
    tin: string | null;
    type: 'Individual' | 'Business';
}

/** A customer unique to this run; `n` keeps phones apart within one run. */
export const customer = (key: string, type: CustomerSpec['type'], n: number): CustomerSpec => ({
    key,
    first: `E2E ${key[0].toUpperCase()}${key.slice(1)}`,
    last: run,
    phone: `09${n}${run.slice(-7)}`,
    tin: type === 'Individual' ? `${n}${run.slice(-9)}` : null,
    type,
});

export async function addCustomer(page: Page, spec: CustomerSpec): Promise<void> {
    await page.goto(app('seller', '/customers/create'));
    await page.getByLabel('Customer Type').click();
    await page.getByRole('option', { name: spec.type }).click();

    if (spec.tin) {
        await page.getByLabel('TIN Number').fill(spec.tin);
    }

    await page.getByLabel('First name').fill(spec.first);
    await page.getByLabel('Last name').fill(spec.last);
    await page.getByLabel('Phone number').fill(spec.phone);
    await page.getByLabel('Email').fill(`e2e.${spec.key}.${run}@duka.test`);
    await page.getByRole('button', { name: 'Save Customer' }).click();

    await expect(page).toHaveURL(/\/customers$/);
    await expect(page.getByText('Customer created successfully.')).toBeVisible();
}

/** Starts a cart for the customer (or a walk-in) and returns its id. */
export async function startCart(page: Page, spec: CustomerSpec | null): Promise<number> {
    await page.goto(app('seller', '/carts/create'));

    if (spec === null) {
        // Walk-in is the cart page's default choice.
        await expect(page.getByRole('button', { name: /Walk-in customer/ }).first()).toHaveAttribute('aria-pressed', 'true');
    } else {
        await page.getByPlaceholder('Name, phone, city or TIN').fill(spec.phone);
        const row = page.getByRole('button', { name: new RegExp(`${spec.first} ${spec.last}`) });
        await expect(row).toContainText(spec.type);
        await row.click();
    }

    await page.getByRole('button', { name: 'Start cart' }).click();
    await expect(page).toHaveURL(/\/carts\?cart=\d+/);

    return Number(new URL(page.url()).searchParams.get('cart'));
}

/** Adds every fixture item to the cart, through each item's page. */
export async function addItems(page: Page, cartId: number): Promise<void> {
    for (const item of fixture.items) {
        await page.goto(app('seller', `/items/${item.item_id}?cart_id=${cartId}`));
        await expect(page.getByText(`Adding into Cart #${cartId}`)).toBeVisible();

        await page.getByRole('button', { name: 'Add to Cart' }).first().click();
        const sheet = page.locator('.MuiDrawer-paper');
        await sheet.getByRole('button', { name: 'Add to Cart' }).click();
        await expect(sheet).toBeHidden();
    }
}

export async function openCheckout(page: Page, cartId: number): Promise<void> {
    await page.goto(app('seller', `/carts?cart=${cartId}`));
    await page.getByRole('link', { name: /Checkout \(\d+\)/ }).click();
    await expect(page).toHaveURL(/\/orders\/confirmation/);
}

/** The whole total as one cash part, taken by the seller now. */
export async function payInCash(page: Page): Promise<void> {
    await page.getByRole('button', { name: /Cash Taken by you now/ }).click();
    await expect(page.getByText('Balanced')).toBeVisible();
}

/** The whole total into the store manager's bank account. */
export async function payIntoAccount(page: Page): Promise<void> {
    await page.getByRole('button', { name: new RegExp(fixture.account.number) }).click();
    await expect(page.getByText('Balanced')).toBeVisible();
}

export const deliveryMethod = (page: Page, name: 'In store' | 'Standard delivery' | 'Vehicle dispatch' | 'Add later') =>
    page.getByRole('radiogroup', { name: 'Delivery method' }).getByRole('radio', { name: new RegExp(name) });

/** A courier run to an address, assigned to the test courier. */
export async function courierDelivery(page: Page): Promise<void> {
    await deliveryMethod(page, 'Standard delivery').click();
    await page.getByPlaceholder('Delivery address (sub-city, woreda, house no.)').fill(`Bole, woreda 3, house ${run}`);
    await page.getByPlaceholder('Recipient name').fill('E2E Recipient');
    await page.getByPlaceholder('Recipient phone').fill('0911000000');
    const couriers = page.locator('select').filter({ hasText: 'Any courier claims it' });
    const courier = await couriers.locator('option', { hasText: fixture.courier.name }).getAttribute('value');
    await couriers.selectOption(courier ?? '');
}

/** Places the order and returns its reference from the To pay page. */
export async function placeOrder(page: Page, cta: string): Promise<string> {
    await page.getByRole('button', { name: cta }).click();
    await expect(page).toHaveURL(/\/orders\/[^/]+\/pay/);

    const reference = decodeURIComponent(new URL(page.url()).pathname.split('/')[2]);
    await expect(page.getByText(`Order ${reference} placed`)).toBeVisible();

    return reference;
}

/** The store manager, the second person, confirms the order's payment. */
export async function confirmPayment(manager: Page, reference: string): Promise<void> {
    const card = () => manager.locator('div.rounded-\\[16px\\]').filter({ hasText: reference });

    await manager.goto(app('seller', '/payments/inbox'));
    await card().first().getByRole('button', { name: 'Confirm received' }).click();
    await manager.getByRole('dialog').getByRole('button', { name: 'Yes, confirm' }).click();
    await expect(card()).toHaveCount(0);
}

/**
 * The seller picks every line, packs it and hands it over: to Delivery for a
 * run, or to the customer for an in-store order.
 */
export async function pickAndPack(page: Page, reference: string, handTo: 'delivery' | 'customer'): Promise<void> {
    await page.goto(app('seller', '/orders?tab=paid'));
    await expect(page.getByText(reference).first()).toBeVisible();

    await page.goto(app('seller', `/orders/${reference}/pick-pack`));

    const nearest = page.getByRole('button', { name: 'Use the nearest location for every line' });
    if (await nearest.isVisible()) {
        await nearest.click();
    }

    const inHand = page.getByRole('button', { name: /^back_hand\s*I have \d+ from/ });
    await expect(inHand.first()).toBeVisible();
    // A ticked line's button turns into "Picked …", so always take the first left.
    const lines = await inHand.count();
    for (let left = lines; left > 0; left--) {
        await inHand.first().click();
        await expect(inHand).toHaveCount(left - 1);
    }

    await page.getByLabel(/Packed and labelled/).check();
    await page.getByRole('button', { name: new RegExp(`^Hand to ${handTo}`) }).click();
    await expect(
        page.getByText(handTo === 'customer' ? `Order ${reference} handed to the customer` : `Order ${reference} packed and handed to delivery`),
    ).toBeVisible();
}
