# Task: Shelf refill v2 — many managers with ticks, stock keeper assignments, suggestions into manifests

You are working in the Duka ERP repo (Laravel 12 + Inertia/React 19). Read `CLAUDE.md` first and
follow it (Docker-only commands, `declare(strict_types=1)`, FormRequests, thin controllers,
services in `app/Services/`, explicit Inertia prop interfaces, Ziggy `route()`). Then read
`SHELF_REFILL_PROMPT.md` (v1, already implemented — this task changes it) and `STOCK_PLAN.md` §10.

Work in **phases**. Finish and test each phase before the next. Stop and report after each phase.

## What v1 built (verify it is still there before you change it)
- `app/Services/Inventory/StockPermissions.php` — the single permission definition + `catalogue()`
  (read by `RefillRequestPolicy`, the controllers and the read-only permissions pages).
- `app/Services/Inventory/RefillEngine.php` — raises refills: floor first (a floor → shelf Transfer
  straight onto the stock keeper's shelving list, no approval), the rest down the item's route
  (`item_refill_routes`) as `refill_requests` legs (`remote_hub` / `shipment`), deduped, net of what
  is in flight, merged per item per store.
- `app/Services/Inventory/RefillWorkflow.php` — approve / updateQuantity / cancel / accept (Remote
  Hub) / buildShipment / addToShipment; follows the carrying Transfer or Shipment
  (`App\Observers\RefillCarrierObserver`); `App\Observers\ShelfRefillObserver` auto-raises.
- `app/Services/Inventory/RefillBoard.php` — waiting list + shelving list read models.
- Pages: `Seller/Locations/Show` (+ `Components/Seller/Locations/ShelfBinMatrix.tsx`),
  `Seller/Refills/Index`, `Seller/Refills/Permissions`, `StockKeeper/Shelving/index`,
  `StockKeeper/Shelving/Permissions`, `Components/Inventory/PermissionsTable.tsx`.
- Managers: `facility_managers` via `HasFacilityManagers` on `StockLocation` (and legacy `Store`),
  capped at 2 by `FacilityManager::MAX_PER_FACILITY`. Assigned in Admin → Inventory → Locations
  (`Admin\Inventory\LocationController`, `Pages/Admin/Inventory/Locations/index.tsx`).
- Shipment manifest builder: `Seller/Shipments/Build` (`Seller\ShipmentController`, routes
  `seller.shipments.*`), backed by `ShipmentWorkflowService`.
- Tests: `tests/Feature/Inventory/{ShelfRefillEngineTest,ShelfRefillFlowsTest,StockPermissionsTest}.php`,
  `tests/Feature/Seller/ShelfBinMatrixTest.php`.

## Decisions (owner, 2026-10-04 — do not re-ask)

### A. Managers and staff
1. **Any number of managers per location.** Remove the cap of 2 (`MAX_PER_FACILITY`, the trait's
   check, `AssignFacilityManagersRequest`/`AssignLocationManagersRequest` `max:` rules, UI limits).
   Keep "primary" as an optional flag if the UI uses it; it no longer limits anything.
2. **Tick boxes per manager assignment.** Each `facility_managers` row carries its own abilities.
   Exactly these, **all ticked by default** for a new assignment:
   - `edit_planogram` — assign/remove items on a shelf, set max / refill line / crit low
   - `set_refill_routes` — choose an item's sources (floor, Remote Hub, shipment)
   - `add_to_remote_list` — move a suggestion onto the Remote Hub → Store list
   - `add_to_manifest` — move a suggestion onto a shipment manifest
   - `adjust_cancel_requests` — change a request's amount or cancel it
   - `accept_at_remote` — accept at the Remote Hub (sends it to Delivery)
   - `shelve` — carry floor → shelf transfers across
   Store as a JSON column (or a pivot) on `facility_managers`. A manager may do a thing only if that
   tick is on. Admin/dev bypass ticks.
3. **Stock keepers are assigned to locations**, many per store and per shelf, in a new assignment
   (e.g. `location_staff`: stock_location_id, user_id). A stock keeper assigned to a store node is
   staff of its shelf and floor too. Stock keepers can raise suggestions and shelve; nothing else.
   Fallback while a location has no staff assigned: keep today's `users.store_id` rule, so nothing
   locks up mid-rollout — mirror how "no managers" behaves. Report this choice.
4. **A Store Shelf belongs to exactly one store** (it already does in the location tree; add a guard
   so it can never be re-parented or shared).
5. **Managers of a store are managers of everything in it:** its shelf, floor **and Remote Hub**
   (the store manager builds both store and Remote Hub manifests), with the same ticks. Managers can
   still be assigned directly to a shelf or Remote Hub as well. Implement the cascade in one place
   (StockPermissions), not by copying rows.
6. Admin → Inventory → Locations: assign any number of managers with their ticks, and any number
   of stock keepers, per location. Show the cascade ("inherits from Main Store") read-only.
7. The read-only "Who can do what" pages also list, for the viewer's store, each person and their
   ticks (still read-only).

### B. Requests are suggestions; the store manager decides
1. **Floor → shelf is unchanged:** it never waits; it goes straight to the shelving list.
2. Everything the floor cannot cover (by stock keeper or the auto trigger) is a **suggestion**
   (`pending`). There is **no separate "approve" step any more**: the manager acting on a suggestion
   *is* the approval. Remove `approved` as a resting state (migrate existing `approved` rows: those
   without a transfer/shipment back to `pending`; report counts).
3. The store manager takes a suggestion and either:
   - **adds it to the Remote Hub → Store list** (needs `add_to_remote_list`) → the Remote Hub accepts
     (`accept_at_remote`) → Delivery carries it → lands on the floor → shelving list, as in v1; or
   - **adds it to a shipment manifest** (needs `add_to_manifest`), when the Remote Hub does not have
     it or the route skips it.
   Either way the amount may be changed at that moment (needs `adjust_cancel_requests` if it
   differs), or the suggestion cancelled with a reason.
4. **Suggestions not acted on stay open** and reappear on every later manifest's panel until added
   or cancelled. A suggestion already on a manifest (even one scheduled for a later day) stays on
   that manifest and does not reappear.

### C. The "Replenishment Manifest" panel in the shipment builder
1. On `Seller/Shipments/Build`, **above** the manifest, a "Replenishment Manifest" panel lists open
   suggestions for the shipment's destination, urgent (crit low) first, with who raised it (stock
   keeper name or "auto") and when.
2. The manager ticks suggestions, may change each amount, and adds them to the manifest. Adding
   sets the suggestion `in_progress` with `shipment_id`, keeps the **requested** amount and the
   **added** amount separately, and the manifest line quantity merges as `addItem` does today.
3. Works for shipments to a **store floor and to a Remote Hub**.
4. Removing a line from the manifest (or the manifest being cancelled) hands its suggestions back to
   `pending` so they reappear. (v1 left manual line removal unsynced — fix it here.)

### D. Remote Hub restocking (both ways)
1. A store suggestion the Remote Hub could not cover may be added to a shipment **to the Remote Hub**
   instead of the store floor; the manager chooses the destination when adding.
2. **The Remote Hub gets its own lines** (min/max/crit per item, like shelf bands), set by managers
   with `edit_planogram` on it. Reaching its refill line auto-raises a suggestion whose only source
   is a shipment from Hub A/B to the Remote Hub. Generalise `ShelfItemBand`/`shelf_item_bands` to any
   stock location of kind shelf or remote_hub rather than adding a parallel table, and keep the
   "planogram first" transfer guard for shelves only.

### E. The stock keeper sees what happened to their request
On the stock keeper's Shelving page, a "My requests" section (and the same status on the shelf
bin) shows each suggestion they or the auto trigger raised for their store, with:
- **Waiting for the manager**
- **Added to Remote Hub list** — then accepted / on its way / landed
- **Added to manifest SHP-… · scheduled for {date}** (the shipment's scheduled slot, or "not
  scheduled yet")
- **Adjusted:** "you asked for 50 Packets; 30 were added to shipment SHP-…"
- **Cancelled by {manager}: {reason}**
- Destination when it went to the Remote Hub instead of the store.

## Phases
1. **Assignments and ticks:** remove the manager cap; ticks on manager assignments; `location_staff`
   for stock keepers; store → shelf/floor/Remote Hub cascade; shelf-belongs-to-one-store guard;
   StockPermissions rewritten on top of ticks + cascade + staff (policies follow); catalogue and
   read-only pages updated. Admin Locations UI for managers-with-ticks and stock keepers. Tests.
2. **Suggestions model:** drop the approve step (migration for existing rows), requested vs added
   amount, add-to-Remote-list, add-to-manifest service (store floor or Remote Hub destination),
   cancel/adjust, manifest line removal/cancel sync, Remote Hub bands + auto-suggestions. Feature
   tests for each, including "unadded suggestions reappear on the next manifest" and "a suggestion
   on a later-day manifest does not reappear".
3. **Manifest builder panel:** the Replenishment Manifest panel on `Seller/Shipments/Build`;
   update `Seller/Refills/Index` (no approve button; "Add to Remote Hub list" / "Add to manifest").
4. **Stock keeper visibility:** "My requests" on the Shelving page and bin status; permissions pages
   show per-person ticks.

## Constraints
- Never run artisan/composer/npm on the host; use `docker exec duka-dev-app …`.
- PHPUnit with the recipe in `CLAUDE.md` (dev image, sqlite in-memory, cache env vars,
  `memory_limit=1G`). Do **not** delete `bootstrap/cache/*`. Baseline: 2 known GD errors, 3 risky.
- **Do not run `vite build` inside `duka-dev-app` while the dev server runs** — it starves it and
  esbuild dies (EPIPE overlay). Check frontend with `tsc --noEmit` and by curling changed files
  from the dev server (`http://localhost:5177/resources/js/<file>` inside the container → 200).
- New migrations must be additive or reversible; data migrations report row counts. Ask before
  running `migrate` on the dev database.
- Do not touch unrelated modified files in the working tree. Do not commit or push unless asked.
- After each phase: what changed, files touched, tests run and results, and any decision this prompt
  did not cover.
