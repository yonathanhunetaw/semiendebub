import { expect, test, type Page } from '@playwright/test';
import { addFirstVariant, openCheckout, startCart, type CustomerSpec } from '../../lib/flows';
import { app, fixture, signIn } from '../../lib/support';

/**
 * Stock set aside for Business customers (Admin → Stores → the item → Edit price → Stock pools). With all
 * of an item set aside, a walk-in (Individual) has none of it on hand: the order confirmation
 * says it will come from a hub. A Business customer still has it in the store.
 * The pool is cleared afterwards, so the other specs share one count again.
 */
const item = fixture.items[0];
const notOnHand = 'Some lines are not on hand at this store.';

const business: CustomerSpec = (() => {
    const { name, phone, tin } = fixture.customers.business;
    const [first, ...last] = name.split(' ');

    return { key: 'business', first, last: last.join(' '), phone, tin, type: 'Business' };
})();

/** Opens the item's sheet in Admin → Stores and sets (or, with '', clears) its Business pool. */
async function setPool(admin: Page, units: string): Promise<void> {
    await admin.goto(app('admin', `/stores/${fixture.store.id}`));
    await admin.getByPlaceholder('Search SKU, name, or scan barcode...').fill(item.name);
    await expect(admin).toHaveURL(/search=/);
    await admin.getByRole('button', { name: new RegExp(item.name) }).first().click();
    // The pools sit at the top of the item's price editor.
    await admin.locator('.MuiDrawer-paper').last().getByRole('button', { name: 'Edit price' }).click();

    const box = admin.locator('.MuiPaper-root').filter({ has: admin.getByText('Stock pools', { exact: true }) }).last();
    if (units === '') {
        await box.getByRole('button', { name: 'Clear' }).click();
        await expect(box.getByText('One shared count again.')).toBeVisible();
    } else {
        await box.getByLabel('Set aside for Business').fill(units);
        await box.getByRole('button', { name: 'Save' }).click();
        await expect(box.getByText('Business pool saved.')).toBeVisible();
        await expect(box.getByText('Individual 0 free')).toBeVisible();
    }
}

test('all of an item set aside for Business: a walk-in waits for a hub, a business buys it from the store', async ({ browser }) => {
    const admin = await signIn(browser, 'admin', fixture.people.admin.email);
    await setPool(admin, '100000');

    try {
        const seller = await signIn(browser, 'seller', fixture.seller.email);

        await test.step('a walk-in: not on hand at this store', async () => {
            const cartId = await startCart(seller, null);
            await addFirstVariant(seller, cartId, item.item_id);
            await openCheckout(seller, cartId);
            await expect(seller.getByText(notOnHand)).toBeVisible();
        });

        await test.step('a business customer: on hand', async () => {
            const cartId = await startCart(seller, business);
            await addFirstVariant(seller, cartId, item.item_id);
            await openCheckout(seller, cartId);
            await expect(seller.getByRole('heading', { name: 'Order confirmation' })).toBeVisible();
            await expect(seller.getByText(notOnHand)).toHaveCount(0);
        });
    } finally {
        await setPool(admin, '');
    }
});
