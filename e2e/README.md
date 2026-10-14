# Browser tests (Playwright)

Real browsers drive the real apps (seller, stock keeper, delivery, admin…) against a
throwaway copy of the dev database. Nothing here touches your `duka` data.

## Running

Keep `make dev` running in another terminal (its Vite serves the pages), then:

| Command | What it runs |
|---|---|
| `make e2e` | every test |
| `make e2e T=seller` | one module (any folder below `e2e/`) |
| `make e2e T=seller/payments` | one part of a module |
| `make e2e-ui T=seller/orders` | the same, in Playwright's window: click a test, watch each step |
| `make e2e ARGS='-g "walk-in"'` | tests whose title matches |

Each run copies `duka` → `duka_e2e`, runs `php artisan e2e:prepare` (test users, customers,
items, prices, stock; written to `e2e/.fixture/fixture.json`) and serves the copy on :8096.
After a run: `npx playwright show-report` for the HTML report, or
`npx playwright show-trace test-results/<test>/trace.zip` for one failure, step by step.

## Modules

```
e2e/
  smoke.spec.ts                 the login page loads
  access/roles.spec.ts          every user type: its own app, refused (sent home) from the others
  seller/
    checkout/                   paying (cash, bank, pay later), delivery methods, no-stock items
    orders/                     whole journeys, in-store hand-over, cancel, failed and returned deliveries
    payments/                   the two-person rule, split payments, "not received yet"
    pricing/                    the price ladder (store → individual → seller → customer), discounts
    customers/                  credit from the admin, selling on it, repayments
    balance/                    a seller handing cash over to a settlement account
    refills/                    a shelf refill raised by the manager, shelved by the keeper
  stock/                        shipments (hub → Remote Hub) and transfers / shelving
  lib/
    support.ts                  signIn(), app(), the fixture and its types
    flows.ts                    the steps specs share: carts, checkout, confirming, pick & pack, delivery
    inspect.ts                  ledger facts (stock per location, an order's stage and holds)
```

## Adding a test

1. Put it in the module folder it belongs to (make a new folder for a new module).
2. Sign people in with `signIn(browser, 'seller', fixture.seller.email)`; each person gets their
   own browser session, so a test can be the seller, the manager and the courier at once.
3. Reuse `lib/flows.ts` for the usual steps; add a new step there if two specs need it.
4. Check amounts with `lib/inspect.ts` (`unitsAt`, `itemStockOf`, `saleOf`, `transferOf`): it
   reads the ledger through `php artisan e2e:inspect`, which refuses any database but `*_e2e`.
5. Need different people, customers, prices or stock? Add them in
   `app/Console/Commands/Dev/PrepareE2eCommand.php` and the `Fixture` type in `lib/support.ts`.

## People (password `e2e-password`)

| Who | Email | App |
|---|---|---|
| Seller | e2e.seller@duka.test | seller (has their own seller prices) |
| Seller Two | e2e.seller-2@duka.test | seller (store prices only) |
| Store manager | e2e.store-manager@duka.test | seller; owns the bank and settlement accounts |
| Second manager | e2e.store-manager-2@duka.test | seller |
| Stock keeper | e2e.stock-keeper@duka.test | stockkeeper; staff of the store and its Remote Hub |
| Hub keeper | e2e.hub-keeper@duka.test | stockkeeper; staff of Main Distribution Hub A |
| Courier | e2e.delivery@duka.test | delivery (a driver) |
| Global admin / store admin | e2e.admin@ / e2e.store-admin@duka.test | admin |
| Finance, procurement, marketing, vendor, dev, shared | e2e.&lt;role&gt;@duka.test | their own app |
