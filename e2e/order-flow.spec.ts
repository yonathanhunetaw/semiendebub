import { expect, test, type Page } from '@playwright/test';
import {
    addCustomer,
    addItems,
    confirmPayment,
    courierDelivery,
    customer,
    openCheckout,
    payIntoAccount,
    pickAndPack,
    placeOrder,
    startCart,
} from './flows';
import { app, fixture, signIn } from './support';

/**
 * The seller order pipeline end to end, for both customer types:
 *
 *   seller adds an individual and a business customer, starts a cart for
 *   each and adds items → checks out (individual pays now into the bank
 *   account; business pays later, then takes cash on the To pay page) →
 *   the store manager confirms both payments → the seller picks & packs →
 *   the courier collects, starts the run and marks it delivered.
 *
 * Runs against the duka_e2e copy prepared by ./deploy/dev.sh e2e.
 */

const customers = {
    individual: customer('individual', 'Individual', 1),
    business: customer('business', 'Business', 2),
};

type Kind = keyof typeof customers;

test('seller → payment → pick & pack → delivery, for an individual and a business customer', async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const refs: Record<Kind, string> = { individual: '', business: '' };

    for (const kind of ['individual', 'business'] as const) {
        await test.step(`seller adds the ${kind} customer`, () => addCustomer(seller, customers[kind]));
    }

    for (const kind of ['individual', 'business'] as const) {
        const cartId = await test.step(`seller starts a cart for the ${kind} customer`, () => startCart(seller, customers[kind]));

        await test.step(`seller adds ${fixture.items.length} items to the ${kind} cart`, () => addItems(seller, cartId));

        refs[kind] = await test.step(`seller checks out the ${kind} cart`, async () => {
            await openCheckout(seller, cartId);

            if (kind === 'individual') {
                // Pay now, the whole total into the store manager's bank account.
                await payIntoAccount(seller);
                await courierDelivery(seller);

                return placeOrder(seller, 'Place order & request confirmation');
            }

            // Pay later; the payment is added on the To pay page.
            await seller.getByRole('button', { name: 'Pay later', exact: true }).click();
            await courierDelivery(seller);

            return placeOrder(seller, 'Place order (To pay)');
        });
    }

    await test.step('seller says the individual customer paid into the bank account', async () => {
        await seller.goto(app('seller', `/orders/${refs.individual}/pay`));
        await seller.getByRole('button', { name: 'Customer says paid' }).click();
        await expect(seller.getByText('will check the account and confirm it')).toBeVisible();
    });

    await test.step('seller adds a cash payment for the business order', async () => {
        await seller.goto(app('seller', `/orders/${refs.business}/pay`));
        await seller.getByRole('button', { name: /Cash Taken by you now/ }).click();
        await expect(seller.getByText('Balanced')).toBeVisible();
        await seller.getByRole('button', { name: 'Save split' }).click();
        await expect(seller.getByText(`Payment split saved for ${refs.business}`)).toBeVisible();
    });

    const manager = await signIn(browser, 'seller', fixture.manager.email);

    for (const kind of ['individual', 'business'] as const) {
        await test.step(`store manager confirms the ${kind} payment`, () => confirmPayment(manager, refs[kind]));
    }

    for (const kind of ['individual', 'business'] as const) {
        await test.step(`the ${kind} order is paid and goes through pick & pack`, () => pickAndPack(seller, refs[kind], 'delivery'));
    }

    const courier = await signIn(browser, 'delivery', fixture.courier.email);

    for (const kind of ['individual', 'business'] as const) {
        await test.step(`courier collects and delivers the ${kind} order`, () => deliver(courier, refs[kind]));
    }

    await test.step('both orders show as delivered to the seller', async () => {
        await seller.goto(app('seller', '/orders?tab=delivered'));
        for (const kind of ['individual', 'business'] as const) {
            await expect(seller.getByText(refs[kind]).first()).toBeVisible();
        }
    });
});

async function deliver(page: Page, reference: string): Promise<void> {
    const card = () => page.locator('.MuiCard-root, .MuiPaper-root').filter({ hasText: reference }).last();

    await page.goto(app('delivery', '/delivery'));

    // The delivery app shows no flash; each move swaps the card's next button.
    const steps: Array<[string, string | null]> = [['Collect', 'Start run'], ['Start run', 'Mark delivered'], ['Mark delivered', null]];
    for (const [step, next] of steps) {
        await card().getByRole('button', { name: step }).click();
        if (next) {
            await expect(card().getByRole('button', { name: next })).toBeVisible();
        }
    }

    await page.goto(app('delivery', '/delivery?status=delivered'));
    await expect(page.getByText(reference).first()).toBeVisible();
}
