# Task: Shelf planogram, refill waiting list, and sourcing escalation

You are working in the Duka ERP repo (Laravel 12 + Inertia/React 19 + MUI). Read `CLAUDE.md`
first and follow it (Docker-only commands, `declare(strict_types=1)`, FormRequests for
validation, thin controllers, services in `app/Services/`, explicit Inertia prop interfaces,
Ziggy `route()`, MUI `sx`). Then read `STOCK_PLAN.md` (esp. §10 decision log) and, before
touching a domain, its skeleton in `docs/scribts/ai-context-skeleton/modules/`.

Work in **phases**. Finish and test each phase before starting the next. Do not start a UI
phase before the rules/data phase beneath it is green. Report at the end of each phase.

## Vocabulary (do not deviate)
- A store has a **Store Shelf** (kind `shelf`) and a **Store** (the floor, kind `backroom`,
  code `STORE-n-FLOOR`). There is **no store room**. Never write "Store Room".
- **Shipment** = Main Hub A and/or B → Store and/or Remote Hub. Delivery carries it.
- **Transfer** = between nearby sites. Floor ↔ shelf: same site, done by a **stock keeper**,
  **no courier**. Remote Hub → Store, and Shelf → Remote Hub: **Delivery carries it**.
  Hub A ↔ Hub B: no delivery.
- "Manager" = a user assigned in `facility_managers` to a location (1–2 per location, via
  `HasFacilityManagers` / `isManagedBy()`). A manager may be a **stock keeper or a seller**;
  never test the role, test `isManagedBy`.

## Existing code you must build on (verify each still exists)
- `app/Services/Inventory/ShelfMatrix.php`, `app/Models/Inventory/ShelfItemBand.php`,
  migration `2026_10_03_150000_create_shelf_item_bands_table.php` (one item per bin; max,
  refill, critical in a pack unit; compared in pieces)
- `app/Http/Controllers/Seller/LocationController.php` (`updateBand`, `requestRefill`,
  `mayRunShelf`), `resources/js/Pages/Seller/Locations/Show.tsx`,
  `resources/js/Components/Seller/Locations/ShelfBinMatrix.tsx`, `resources/js/types/sellerLocations.ts`
- `app/Models/Inventory/StockLocation.php` (`canBeOperatedBy`), `app/Models/Concerns/HasFacilityManagers.php`
- `app/Services/TransferWorkflowService.php`, `app/Policies/StockKeeper/TransferPolicy.php`,
  `app/Services/StockService.php` (`availableAt`), `PackagingLadder`
- Stock rules: `item_stocks` is the ledger of record; items lead; quantities are in the
  variant's packaging unit and spoken per location. Never debit an origin without crediting
  custody ("In Delivery" transit location). Keep conservation tests green.

## Rules to implement

### 1. Planogram (a shelf's assigned items and lines)
- A bin exists because an item is **assigned** to the shelf with `max`, `refill`, `critical`
  (`ShelfItemBand`), even while the shelf is empty. Empty assigned bins render with their lines.
- **Add an "Assign item" action** (item picker, then band dialog). Assignment and every band
  edit/removal are allowed only to: that shelf's managers, and admin/dev. An **unmanaged
  shelf is editable by admin/dev only** (do NOT reuse `canBeOperatedBy`'s "anyone if
  unmanaged" fallback for this).
- Everyone else in the store (sellers, stock keepers) gets a **read-only** view: items,
  quantity, refill line, crit low.
- Replace `mayRunShelf` with two distinct checks: `mayViewShelf` (store members + managers +
  admin/dev) and `mayEditPlanogram` (managers + admin/dev). Pass `canEditShelf` accordingly.
- **Block stock onto a shelf for items not assigned there.** Enforce in the transfer creation
  path (`TransferWorkflowService::create` or a guard it calls), with a clear error. Stock
  already on shelves for unassigned items must not break; surface it as "Unassigned" in the
  UI, excluded from the refill queue.
- Unclear positions: keep bin order as it is today (banded, in creation order); do not add
  fixed coordinates in this task.

### 2. Sourcing route (per item, per store)
- A manager sets, per item per store, the **ordered sources** the system may use to refill:
  any of `floor`, `remote_hub`, `shipment`. Example: pens = `floor, shipment` (skip remote).
- New table e.g. `item_refill_routes` (store_id, item_id, ordered sources). Default when
  unset: `floor, remote_hub, shipment`. Editable by store managers and admin/dev only.
- The system always follows this route; a source not on the route is never used.

### 3. Refill needs and the waiting list
A bin needs refill when its stock is at or below its refill line (`status` refill/critical/empty
for a banded item). Needs are raised **automatically** and may also be raised **manually by a
stock keeper**. Both land in the same refill-request model.

For a bin needing `shortfall = max − current` (in pieces, expressed in the band's unit):
- **Floor first** (if `floor` is on the route and the floor has any): create the **floor →
  shelf transfer for `min(shortfall, floor available)`** straight onto the stock keeper's
  **Shelving list**. **No manager approval** for this step.
- **Remainder** goes to the **next source on the route**, as a request that waits for manager
  approval:
  - `remote_hub`: a **Remote Hub → Store** transfer request. Flow: store manager approves →
    the Remote Hub accepts (its manager or a stock keeper there) → Delivery carries it → it
    lands on the **store floor** (and then feeds the Shelving list). Reuse the existing
    transfer + custody ("In Delivery") machinery; do not invent a second one.
  - `shipment`: a line on the **shipment manifest**, **unassigned to Hub A/B until the
    shipment is built**. The store manager approves it.
- The store manager can **approve, edit (quantity) or cancel** a waiting-list request.
- If the floor has none, skip straight to the next source (same rule, shortfall = full amount).
- Auto-raise at the **refill line**; mark the request **urgent** when at or below crit low.
- A stock keeper can add an escalation by hand (e.g. shelf looks short, floor count is wrong);
  it goes through the same checks below.
- "Store manager" who approves remote/shipment requests = the **store's** manager (not
  only the shelf's). If the repo has no clear store-manager concept, use
  `Store::isManagedBy()` and tell me.

### 4. Duplicate and overlap checks (must be enforced in the service, with tests)
- At most **one open need per bin**.
- At every step, **do not create a request that an open one already covers** for that item and
  destination.
- Quantities are **net of what is already on the way** (open transfers, approved but not
  landed, open shipment lines). A new need asks only for the remaining shortfall.
- Shipment lines are **per item per store** (not per shelf): two shelves in one store needing
  pens merge into one line.
- All of the above under a DB transaction with row locks where stock is read, consistent with
  how `StockService` / `TransferWorkflowService` already lock.

### 5. Pages (follow the UI order and look decided in `STOCK_PLAN.md` / seller console mockup)
- **Refill requests** (seller side, managers): waiting list with approve / edit / cancel;
  tabs or filters for Remote → Store and Shipment, per shelf and per store; urgent first.
- **Shelving list** (stock keeper app): floor → shelf transfers to carry out; mark done = the
  transfer completes via the existing workflow. Approved Remote → Store deliveries appear in
  the existing Delivery queue, not a new one.
- **Shelf matrix**: "Assign item" on empty cells; a "refill pending" badge on bins with an
  open request; "Unassigned" marker for stray stock; read-only mode for non-managers.
- **Roles & permissions** (read-only page): a table of actions (view shelf, edit planogram,
  set sourcing route, shelve, approve refill, accept at Remote Hub, approve shipment line…)
  against who may do them (seller, stock keeper, location manager, admin/dev). Build it from
  a single code-level definition that the policies also use, so the page cannot drift from
  the real rules. **No editing on this page.**

## Phases
1. **Rules and data:** permission split, block-on-transfer guard, `item_refill_routes`,
   refill-request model/migrations, the refill engine (floor split, route, escalation,
   dedupe), policies, a permissions definition. Backend tests only.
2. **Flows:** manager approve/edit/cancel, Remote accept, shipment-line creation/merge,
   manual stock-keeper add, auto-raise hook. Feature tests for each flow and every dedupe rule.
3. **Shelf UI:** Assign item, empty bins, badges, read-only mode, Unassigned marker.
4. **Lists UI:** Refill requests page, Shelving list, Roles & permissions page.

## Constraints
- Never run artisan/composer/npm on the host; use `docker exec duka-dev-app …`.
- Run PHPUnit with the recipe in `CLAUDE.md` (dev image, sqlite in-memory, cache env vars,
  `memory_limit=1G`). Do **not** delete `bootstrap/cache/*`. The two known environmental
  test errors are the baseline; everything else must pass.
- Frontend: `tsc --noEmit` and a `vite build --outDir /tmp/build-check` must pass.
- New PHP files: `declare(strict_types=1)`. New React files: `.tsx`, explicit prop interfaces,
  `<Head title>`, layout attached after the component, MUI `sx`, no raw inline `style`.
- Do not touch unrelated modified files in the working tree (there are uncommitted edits in
  several Admin/Delivery pages). Do not commit or push unless asked.
- After each phase give: what changed, files touched, tests run and their results, and any
  decision you had to make that this prompt did not cover.
