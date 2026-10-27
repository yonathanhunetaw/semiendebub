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

Uploads are safe: the test server sets `R2_LOCAL=true`, so the `r2` disk (item pictures) writes to
`storage/app/public/r2-local` instead of the bucket dev shares with prod.

Each run copies `duka` → `duka_e2e`, runs `php artisan e2e:prepare` (test users, customers,
items, prices, stock; written to `e2e/.fixture/fixture.json`) and serves the copy on :8096.
After a run: `npx playwright show-report` for the HTML report, or
`npx playwright show-trace test-results/<test>/trace.zip` for one failure, step by step.

## Modules

```
e2e/
  smoke.spec.ts                 the login page loads
  access/roles.spec.ts          every user type: its own app, refused (sent home) from the others
  access/guide-link.spec.ts     no "How this works" button on any page; the guide is one step from each app's Settings
  <module>/pages.spec.ts        every page of that app opens clean: no error status, no JS error,
                                no console error, no 500 behind it; also the first record a list links to
  admin/
    apps/                       the Apps menu: apps A to Z, then Me first and people A to Z; opening as a seller with no
                                login, the round nine-dots button saying who you are, switching again from inside, Back to
                                admin; a store admin only themself in the apps they are ticked for; Settings on a phone
    store/                      the Store hub (Stock, Movement, Approvals cards, no tab bars), every tile and its back link,
                                an item as stacked cards (where it is, how packed, refill levels, variants), no fake controls
    item-setup/                 a new item made on its one page; pictures (gallery + a variant slot) through the real
                                file chooser, served from the local r2 stand-in (never prod's bucket), then removed
                                (and the file with it)
    settings/                   "Also works as" ticks on a user, and the global-admin checkbox; the dev layer (hidden demo
                                users, Dev on a global admin) in the Users list, Sessions and the Apps menu; Locations read-only
                                for a store admin
                                adding and renaming a store, taking on a seller who signs straight in
                                Import / Export: a whole catalogue from files (categories → items → barcodes → store → prices →
                                a stock count approved in Admin → Counts); a wrong line is named; the zip; a store admin is refused
    pricing/                    business / individual / seller / customer prices set in Admin → Stores,
                                then the seller's cart charging each; stock pools (set aside for Business)
  seller/
    checkout/                   paying (cash, bank, pay later), delivery methods, no-stock items
    orders/                     whole journeys (checked in the ledger too), in-store hand-over, cancel,
                                failed and returned deliveries, the courier's History, and an item only
                                the main hub has: held there, shipped to the Remote Hub, then delivered
    payments/                   the two-person rule, split payments, "not received yet"
    pricing/                    the price ladder (store → individual → seller → customer), discounts
    customers/                  credit from the admin, selling on it, repayments
    balance/                    a seller handing cash over to a settlement account
    refills/                    a shelf refill the floor covers; one it cannot, sent on via the Remote Hub list
  seller/stock-keeping/         a seller ticked as a stock keeper: Stock keeping under /stock in the seller app, every link
                                staying there, a stocktake counted there and approved by a second keeper
  stock/                        shipments (hub → Remote Hub) and transfers / shelving
                                the Guide world: Director faces a building's door, the hub item finder marks an item, Play's controls ride in
                                the top bar when wide, and the Racks view puts an item on a slot (a taken slot swaps)
  stockkeeper/                  stocktakes: approved by a second keeper, or by the manager in Admin → Counts;
                                receiving short and damaged, the shortfall settled by a second keeper
  delivery/, vendor/            editing one's own profile
  storefront/                   the public shop as a guest: cart, quantities, checkout → sign in
  calendar/                     /calendar opens clean on all five apps; a monthly bill marked paid today
                                is due next month, ticked paid there, and seen by a colleague
  work/                         keys, opening with the printed QR, clocking in with the moving code, breaks,
                                closing and handing the key on; shift swaps and leave; a staff ride home; the
                                day's opener/closer/driver; at the Remote Hub a late opening, opening without
                                the key, a close that waits for a clock-out, a fixed clock-in and holiday overtime
                                approved (e2e:prepare keeps it open 00:00–23:59, fresh for today)
  finance/                      an expense with a receipt photo, opened and confirmed by a second person
  procurement/                  the pipeline (idea → quote → landed cost → receiving), purchase orders, payments,
                                tariffs from a CSV file (a wrong line saves nothing)
  dev/, marketing/, shared/     page sweeps only (most are placeholders)
  lib/
    support.ts                  signIn(), app(), the fixture and its types
    files.ts                    pngFile() and csvFile(): files to hand to an upload input
    flows.ts                    the steps specs share: carts, checkout, confirming, pick & pack, delivery
    inspect.ts                  ledger facts (stock per location, an order's stage and holds, a store, a site's QR codes)
    pages.ts                    sweep() and pagesTest(): open a list of pages and collect every fault
    profile.ts                  profileTest(): edit a phone number on /profile and see it kept
    shipments.ts                signing, checking, the manifest picker, a whole hub → Remote Hub shipment
    transfers.ts                raise, claim, hand to the courier, hand over, receive (with counts)
```

## Adding a test

A new page? Add its path to that app's `pages.spec.ts` and the sweep covers it.


1. Put it in the module folder it belongs to (make a new folder for a new module).
2. Sign people in with `signIn(browser, 'seller', fixture.seller.email)`; each person gets their
   own browser session, so a test can be the seller, the manager and the courier at once.
3. Reuse `lib/flows.ts` for the usual steps; add a new step there if two specs need it.
4. Check amounts with `lib/inspect.ts` (`unitsAt`, `itemStockOf`, `saleOf`, `transferOf`, `storeNamed`): it
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
| Keeper Two | e2e.stock-keeper-2@duka.test | stockkeeper; the same posts, to approve the first keeper's counts |
| Hub keeper | e2e.hub-keeper@duka.test | stockkeeper; staff of Main Distribution Hub A |
| Courier | e2e.delivery@duka.test | delivery (a driver) |
| Global admin / store admin | e2e.admin@ / e2e.store-admin@duka.test | admin |
| Finance, procurement, marketing, vendor, dev, shared | e2e.&lt;role&gt;@duka.test | their own app |
