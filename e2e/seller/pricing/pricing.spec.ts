import { expect, test } from '@playwright/test';
import { addFirstVariant, openCheckout, placeOrder, startCart, type CustomerSpec } from '../../lib/flows';
import { saleOf } from '../../lib/inspect';
import { app, fixture, signIn } from '../../lib/support';

/**
 * The price ladder (PriceProvider), seen from the cart. Every variant of the price item carries
 * a known price at each level (PrepareE2eCommand::setPrices), and the last level that applies wins:
 *
 *   store 100  →  individual 90 (walk-ins and customers with a TIN)
 *              →  the seller's own price: 85 for an individual, 95 for a business
 *              →  the customer's own contract price: 70
 *
 * Only the E2E Seller has a seller price; Seller Two sells at the store's prices.
 */
const { prices } = fixture.priceItem;

const fromFixture = (key: keyof typeof fixture.customers, type: CustomerSpec['type']): CustomerSpec => {
    const { name, phone, tin } = fixture.customers[key];
    const [first, ...last] = name.split(' ');

    return { key, first, last: last.join(' '), phone, tin, type };
};

const customers = {
    walkIn: null,
    individual: fromFixture('individual', 'Individual'),
    business: fromFixture('business', 'Business'),
    contract: fromFixture('priced', 'Business'),
};

const cases: Array<{ seller: 'seller' | 'seller2'; customer: keyof typeof customers; price: number; why: string }> = [
    { seller: 'seller2', customer: 'walkIn', price: prices.individual, why: 'a walk-in is an individual' },
    { seller: 'seller2', customer: 'individual', price: prices.individual, why: 'a customer with a TIN is an individual' },
    { seller: 'seller2', customer: 'business', price: prices.store, why: 'a business pays the store price' },
    { seller: 'seller2', customer: 'contract', price: prices.customer, why: "the customer's own price wins" },
    { seller: 'seller', customer: 'walkIn', price: prices.sellerIndividual, why: "the seller's individual price beats the individual price" },
    { seller: 'seller', customer: 'individual', price: prices.sellerIndividual, why: "the seller's individual price" },
    { seller: 'seller', customer: 'business', price: prices.sellerBusiness, why: "the seller's business price beats the store price" },
    { seller: 'seller', customer: 'contract', price: prices.customer, why: "the customer's own price beats the seller's" },
];

const birr = (amount: number) => `ETB ${amount.toFixed(2)}`;

for (const { seller: who, customer, price, why } of cases) {
    test(`${who === 'seller' ? 'E2E Seller' : 'Seller Two'} + ${customer}: ${birr(price)} (${why})`, async ({ browser }) => {
        const email = who === 'seller' ? fixture.seller.email : fixture.people.seller2.email;
        const seller = await signIn(browser, 'seller', email);

        const cartId = await startCart(seller, customers[customer]);
        await addFirstVariant(seller, cartId, fixture.priceItem.item_id);

        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await expect(seller.getByText(birr(price)).first()).toBeVisible();
    });
}

/** A discount on the store price applies until its end date, then the full price is back. */
for (const [state, expected] of [
    ['running', (d: { discount_price: number }) => d.discount_price],
    ['expired', (d: { price: number }) => d.price],
] as const) {
    const discount = fixture.discounts[state];

    test(`${state === 'running' ? 'a running discount: the discounted' : 'an expired discount: the full'} price, ${birr(expected(discount))}`, async ({ browser }) => {
        const seller = await signIn(browser, 'seller', fixture.people.seller2.email);
        const cartId = await startCart(seller, customers.business);
        await addFirstVariant(seller, cartId, discount.item_id);

        await seller.goto(app('seller', `/carts?cart=${cartId}`));
        await expect(seller.getByText(birr(expected(discount))).first()).toBeVisible();
    });
}

test("the order keeps the cart's price: the contract customer's 70 ETB, not the store's 100", async ({ browser }) => {
    const seller = await signIn(browser, 'seller', fixture.seller.email);
    const cartId = await startCart(seller, customers.contract);
    await addFirstVariant(seller, cartId, fixture.priceItem.item_id);
    await openCheckout(seller, cartId);
    await seller.getByRole('button', { name: 'Pay later', exact: true }).click();
    await seller.getByRole('radiogroup', { name: 'Delivery method' }).getByRole('radio', { name: /Add later/ }).click();
    const reference = await placeOrder(seller, 'Place order (To pay)');

    const sale = saleOf(reference);
    expect(sale.lines).toEqual([expect.objectContaining({ quantity: 1, price: prices.customer })]);
    expect(sale.total).toBeCloseTo(prices.customer, 2);
});
