# Stock handoff: one ledger, one location tree

Status: **FINAL, ready for implementation.** Nothing here has been executed. Written 2026-10-03.
Companion: `AUDIT.md` (full problem list; items D1-D5 are fixed by this work).

## 0. Goal

1. `item_stocks` is the only place a quantity is stored. Remove every other copy.
2. Every place stock can sit is a row in one `stock_locations` tree (Odoo `stock.location` style), instead of the current mix of `stores`, `warehouses` and `item_inventory_locations`.
3. Checkout can no longer oversell. Every stock change is locked, can't go negative, and leaves a journal row.
4. Admin has one clear Locations area that shows all five tiers.

## 1. Settled decisions (do not re-ask)

- Stock lives on the physical SKU (`item_variant`) at a location. Never on `StoreVariant` (that is a price listing).
- `inventory_movements` = audit journal only. Never read for availability. Dev DB has 0 rows.
- Quantities stay in the variant's own packaging unit; spoken per location via `PackagingLadder` (shelf: smallest unit; everything else: biggest first). See memory `duka-stock-ssot`.
- Stock is stored **only at leaf, stockable locations**. Store totals are computed (shelf + back room), never stored.
- Names: `Main Distribution Hub` → **Main Distribution Hub A**; `North Valley Annex` → **Main Distribution Hub B**; every "Remote Warehouse" label → **Remote Hub**.
- Wesen Warehouse A/B (`item_inventory_locations` ids 3, 4, kind `other`) are deleted; they hold no stock.

## 2. Target model

### 2.1 Table `stock_locations`

| column | notes |
|--------|-------|
| id | |
| parent_id | nullable self FK; tree |
| kind | `store` (group node, not stockable), `shelf`, `backroom`, `remote_hub`, `main_hub` |
| name, code (unique), address, status | |
| store_id | nullable FK to `stores`; set for the store node and its children |
| is_stockable | true for shelf, backroom, remote_hub, main_hub; false for `store` nodes |
| managers | reuse `facility_managers` (re-pointed to `stock_location_id`) |

Tree for the current data:

```
Main Distribution Hub A   (main_hub, shared)        ← ex warehouses#1, 1,341 units stay here
Main Distribution Hub B   (main_hub, shared)        ← ex warehouses#2, 102 units
Main Store      (store, store_id=1)
  ├─ Store Shelf        (shelf)      ← ex item_inventory_locations#1 "Shop"
  ├─ Store              (backroom)   ← ex #2 "Shop Warehouse"
  └─ Remote Hub         (remote_hub) ← NEW, empty (only Main Store has one)
Second Store    (store, store_id=2)
  ├─ Store Shelf        (shelf)      ← ex #5
  └─ Store              (backroom)   ← ex #6
Online Store    (store, store_id=3)  ← keeps shelf + backroom as today (ex #7, #8)
```

Rules: a Remote Hub is optional (0 or 1 per store), never auto-created. Hubs A and B are shared by all stores. Only stockable locations may have `item_stocks` rows (enforced in the gateway and a test).

### 2.2 What `stores` becomes
`stores` stays the **retail business entity** (prices via `store_variants`, carts, sales, staff). Its `type` warehouse values (`central_warehouse`, `remote_warehouse`) and the duplicate seeded "Warehouse A/B/Remote Warehouse" rows from `FacilitySeeder` are removed. `Store::booted()` creates the store node + shelf + backroom `stock_locations` instead of `item_inventory_locations` rows.

### 2.3 Foreign keys to re-point to `stock_locations`
Opus must grep for every use and migrate each (expand → backfill → switch → contract):
- `item_stocks.location_type/location_id` (morph) → `stock_location_id` FK, unique `(item_variant_id, stock_location_id)`.
- `store_variant_capacities` morph location → `stock_location_id`.
- `transfers.source_location_*` / `destination_location_*` (morph).
- `shipments.origin_store_id` / `destination_store_id` → origin/destination `stock_location_id`. **Risk:** read `ShipmentWorkflowService` and `MovementDomainService` first. Proposed rule: a shipment endpoint is a stockable location; when a retail store is named, default to its backroom.
- `facility_managers`, `sale_items.source_location_*`, `deliveries.source_location_*`.
- Models to retire or alias: `Warehouse`, `ItemInventoryLocation`, one of the two `ItemStock` classes (`Inventory\ItemStock` vs `StockKeeper\ItemStock`; keep one).

## 3. Ledger gateway and reservations

### 3.1 Gateway
Extend `App\Services\StockService` into the **only** code that writes `item_stocks`. Methods: `receive`, `reserve`, `release`, `pick`, `moveOut`, `moveIn`, `adjust`. Each: DB transaction → `lockForUpdate` the stock rows (consistent lock order to avoid deadlocks) → refuse to go below zero (throw `InsufficientStockException`; **no silent clamping**) → write one `inventory_movements` row (who, why, reference) → rely on `ItemStockObserver` for replenishment sweep.

Migrate every direct writer to it: `CheckoutService`, `OrderSourcingService`, `TransferWorkflowService`, `ShipmentWorkflowService`, `StockKeeperService`, `StoreLocationStockService`, `VendorService`, `Admin\Store\StoreController`, `Admin\Inventory\WarehouseController`, seeders (`StockLedgerSeeder` stays the single seed owner).

### 3.2 Reservations
New table `stock_reservations` (`sale_item_id`, `item_variant_id`, `store_id`, `quantity`, `status` open|picked|released, timestamps).
- Checkout **reserves** at store level (shelf + backroom of that store) and fails if `on_hand − open reservations < requested`, under lock.
- Pick & Pack (`OrderSourcingService::confirmSourcing`) converts the reservation into a real debit from the leaf location the picker confirmed; re-check order stage inside the transaction.
- Cancel/expiry releases. Add a scheduled release for stale reservations.
- `CheckoutService` stops calling `recordSale` movements as the stock effect.

## 4. Phases (each one shippable, with tests green before moving on)

| # | Phase | Notes |
|---|-------|-------|
| 0 | **Backup + safety** | Take a DB dump first. Every data migration has a dry-run mode and a row-count assertion. Work in `docker exec duka-dev-app` per CLAUDE.md. |
| 1 | Create `stock_locations` + models + factory; backfill tree from current `stores`, `warehouses`, `item_inventory_locations`; rename hubs; create Main Store's empty Remote Hub; delete Wesen A/B | additive only; old tables still used |
| 2 | Leaf conversion | Each store-level `item_stocks` row (4,887 rows, 134,903 qty) becomes shelf + backroom rows: shelf = existing shelf row qty (0 today), backroom = store qty − shelf. Assert per-variant totals identical before/after. Hub rows (20 rows, 1,443 qty) move to hub locations. |
| 3 | Gateway + journal + reservations + tests | new code behind the old reads; no behaviour change yet |
| 4 | Cut over writers, then readers | checkout reserves; pick debits; admin, seller, stock keeper and delivery all read via `ItemStockReader`/gateway. Re-point shipments/transfers/capacities/managers FKs here. Also update the seller location pages, added 2026-10-03: `SellerLocationBoard::ledgerPair()` (reads stock and bands through `stock_locations.legacy_*`) and the hub check in `SellerOrderBoard::present()` (`source_location_type` contains `Warehouse`); `tests/Feature/Seller/SellerOrderBoardTest.php` covers both. |
| 5 | Delete old paths | drop `store_variants.stock` (+ fillable, `ItemDeployController` `'stock' => 0`, seeders); remove movement fallback in `getBatchStock` and `getCurrentStock` movement sums; delete `StockService::transferStock`, legacy transfer actions in `Admin\Store\StoreController` (`dispatchTransfer`, `receiveTransfer`, `cancelTransfer`, `storeTransfer`, routes in `routes/web/admin/store.php:40-42`); drop `warehouses`, `item_inventory_locations`, `stores.type` warehouse values; delete duplicate `ItemStock` model |
| 6 | Locations UI | section 5 |

## 5. Locations UI (admin → Inventory → Locations)

| Page | Shows |
|------|-------|
| Overview | five-tier ladder (Shelf → Store → Remote Hub → Hub A / Hub B) with totals per tier and low-stock counts |
| Shelves | every store's shelf vs its min/max band |
| Stores | shelf + back room + total per store (reuse the existing store inventory page) |
| Remote Hubs | Main Store's Remote Hub: stock, incoming/outgoing |
| Main Hubs | Hub A and Hub B (replaces what `/warehouse` shows; `/warehouse` redirects here) |
| Location detail | stock by item (packaging ladder), bands, journal tab, open transfers/shipments |

Generalise `Admin\Inventory\WarehouseController` by `kind`; reuse `StoreController` inventory page, `ItemStockReader`, `PackagingLadder`. Use Ziggy route names in the sidebar (`AdminSidebar.tsx`), one `.layout`, `<Head>`, typed props with `= []` defaults. Rename "Remote Warehouse" in `Store.php:58`, `StoreController.php:235,832`, `StoreLocationStockService`, and UI strings.

## 6. Defaults I chose (change if wrong)
- Main Store's Remote Hub is named **"Main Store Remote Hub"** and starts empty.
- Online Store keeps its shelf and back room unchanged.

## 7. Acceptance tests (must exist and pass)
1. Conservation: total across all locations unchanged by transfer, shipment, receive, pick, cancel.
2. Oversell: two concurrent checkouts for the last unit, only one succeeds.
3. No negative stock anywhere; no silent clamp (replaces behaviour at `TransferWorkflowService.php:~278`).
4. Admin, seller, stock keeper and delivery screens report the same figure for one variant (the disagreement that started memory `duka-stock-ssot`).
5. Stock rows exist only at stockable locations.
6. Migration test: per-variant totals before == after phase 2; hub rows 20/1,443 and store rows 4,887/134,903 reconciled.
7. Shipment and transfer flows still pass (`tests/Feature/Shipment/*`, `tests/Feature/Inventory/*`, `tests/Feature/Fulfillment/OrderSourcingTest.php`).
8. Baseline: the suite had 2 known environmental errors (GD) and 3 risky; nothing new may fail.

Run tests with the docker command in `CLAUDE.md` (sqlite, cache paths overridden, `memory_limit=1G`); do not delete `bootstrap/cache/*`.

## 8. Out of scope here
Security fixes (S1-S12), sessions, the ops page, the backend dashboard and the shipments redesign. They are tracked in `AUDIT.md` and come after this.

## 9. Prompt to paste into Opus

> Implement `STOCK_PLAN.md` in /Users/baby/Desktop/Duka, phase by phase, stopping after each phase for my review. Read `CLAUDE.md`, memory `duka-stock-ssot`, and `docs/scribts/ai-context-skeleton/master.md` first. Phase 0 is a database backup, with no schema changes before it. Before phase 4, read `ShipmentWorkflowService` and `MovementDomainService` and tell me how shipments will address locations. Never run artisan, composer or npm on the host. Do not commit unless I ask.

## 10. Execution log (2026-10-03)

Phases 0–4 are done on dev (backups in `storage/app/backups/`). Nothing committed.

Decisions made by the owner during execution (these override earlier text above):
- A store has a **Store Shelf** and a **Store** (the floor, kind `backroom`, code `STORE-n-FLOOR`). There is no store room.
- **Shipments** run only from **Main Hub A/B** to a store floor or a Remote Hub (`MovementDomainService::assertShipmentEnds`). Anything leaving a Main Hub is a shipment; every other move is a transfer.
- **Delivery carries every movement between sites.** Goods in a courier's hands sit at one `transit` location, "In Delivery" (`StockLocationTree::transit()`), so custody is conserved at every step:
  - Transfer between sites (e.g. Remote Hub → Store): a courier claims it (Delivery → Transfers), the origin dispatches = hands to the courier, the courier hands over = lands at the destination. Same-site (floor ↔ shelf) needs no courier.
  - Shipment: dispatched = hub → In Delivery; received = In Delivery → destination; cancelled after dispatch = back to the hub.
  - Customer order: checkout reserves; Pick & Pack (shelf, floor or Remote Hub only — never a Main Hub) moves the goods into In Delivery; delivered = they leave the network; returned = back where picked. A courier cannot collect an unpicked order.
- **Managers per location** (`StockLocation` uses `HasFacilityManagers`; Admin → Inventory → Locations). When a location has managers, only they (and admins) hand stock out of it or take it in; they are its dock party on shipments. No managers = run by role.
- Delayed-delivery checkout lines hold real stock at the nearest hub (`StockService::reserveAt`).
- Custody log per order: seller → Orders → tap the reference (`seller.orders.custody`), built from the journal by `CustodyLog`.

Still open: phase 5 (drop the morph columns, `warehouses`, `item_inventory_locations`, the duplicate `ItemStock`, and the `stores.type` warehouse values; add the unique `(item_variant_id, stock_location_id)` key), phase 6 (the remaining Locations UI pages, the shelf bin matrix, and the "Remote Warehouse" → "Remote Hub" relabel), capacity bands and sale/delivery sources still keyed by the old address (they read correctly through `StockScope`), and the admin Replenish dialog, which is a client-side mock.

### Role walk-through (2026-10-03, later)
Seller, stock keeper, delivery and admin flows were driven end to end through the real routes (`SellerOrderJourneyTest`, `PickQueueTest`, `AdminTransferFlowTest`, `AdminOperationsTest`, `RolePagesSmokeTest` — which opens every page of the Stock Keeper, Delivery and Admin apps over a populated world).
Added: seller place/pay/cancel/address (`SellerOrderService`); stock keeper pick queue on real orders; admin Orders, Deliveries, Payments, transfer create/show; Shelf Bin Matrix (`shelf_item_bands`, `ShelfMatrix`, one item per bin, band in a pack unit, refill = floor→shelf transfer).
Retired: the demo admin Replenish wizard (redirects to the shipment board).
Open decisions: wire the public storefront checkout (still "coming soon"); run phase 5; production needs `migrate` (shelf_item_bands) and a frontend build.
