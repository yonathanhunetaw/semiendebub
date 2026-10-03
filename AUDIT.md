# Duka audit checklist (2026-10-03)

Status: ☐ open · Severity: 🔴 critical · 🟠 high · 🟡 medium · ⚪ low

## Table 1: Things that need fixing

### Security
| # | Sev | Issue | Where |
|---|-----|-------|-------|
| S1 | 🔴 | Role checks do nothing: early `return $next($request);` so every `role.subdomain` gate passes. Open registration means a new user can reach admin `/users`. | `app/Http/Middleware/EnsureCorrectSubdomainRole.php:19` |
| S2 | 🔴 | Any logged-in user can list or kill all sessions (mounted on root, finance, marketing). | `Admin\SessionController`, `routes/web/user/user.php:115`, `finance.php:35`, `marketing.php:41` |
| S3 | 🔴 | Debug routes with no auth. | `routes/web/shared/shared.php:23-34`, `marketing.php:24` |
| S4 | 🟠 | Login flow logs session cookies and emails. | `AuthenticatedSessionController.php:44,54,62,86` |
| S5 | 🟠 | User update logs `$request->all()`, including passwords. | `Admin\UserController.php:103` |
| S6 | 🟠 | Hardcoded DB password in a tracked script. | `docker/backup-db.sh:12` |
| S7 | 🟠 | Seeded admin accounts have weak passwords and are re-created on prod reseed. | `database/seeders/User/UserSeeder.php`, `deploy.sh:696-712` |
| S8 | 🟠 | Lesson routes and `/downloads` are public. | `routes/web.php:6,49-50` |
| S9 | 🟠 | IDORs: any seller can open any order or edit/delete any customer; cart can be set to `completed` with no sale. | `Seller\OrderController`, `Seller\CustomerController`, `Seller\CartController:225` |
| S10 | 🟡 | CSRF exempt for `login`; `trustProxies(at:'*')`. | `bootstrap/app.php:26-30` |
| S11 | 🟡 | No throttling on checkout, cart, register, forgot-password. | `routes/web/storefront/storefront.php`, `routes/auth.php` |
| S12 | ⚪ | SVG uploads allowed; `SESSION_SECURE_COOKIE` has no default. | `CanvasController.php:141`, `config/session.php:167` |

### Stock and data integrity
| # | Sev | Issue | Where |
|---|-----|-------|-------|
| D1 | 🔴 | Old transfer code skips the approval gate, references a nonexistent `Inventory\ItemInventoryLocation`, credits the destination without debiting the source, and `storeTransfer` sets `to_location_id = from_location_id`. Replace with `TransferWorkflowService`. | `Admin\Store\StoreController.php:994-1120` |
| D2 | 🔴 | A transfer debit is clamped to what is on hand, but completion credits the full quantity (stock created from nothing). Cancel refunds the full amount. | `TransferWorkflowService.php:~278` |
| D3 | 🟠 | Race conditions: no lock on the transfer, shipment or delivery row; double dispatch or receive can double-apply. | `TransferWorkflowService`, `ShipmentWorkflowService::transition`, `DeliveryService::claim` |
| D4 | 🟠 | Ledger split: sales write `inventory_movements`, availability reads `item_stocks`. No reservation, so overselling is possible. | `CheckoutService::recordSale`, `StockService.php` |
| D5 | 🟠 | Receive and adjust write no audit movement and no reason; adjust sets an absolute quantity without a lock. | `StockKeeperService.php:~300-340` |
| D6 | 🟡 | Order sourcing accepts a picked quantity lower than the line, and does not re-check the stage inside the transaction. | `OrderSourcingService.php:245-310` |
| D7 | 🟡 | Model mismatches: `CartItem::item()` points at a nonexistent class; fillables name nonexistent columns; `Store::$fillable` omits `manager`; missing `$casts` on `Sale`, `CartItem`, `StoreVariant`. | `app/Models/**` |
| D8 | 🟡 | Missing indexes on polymorphic location columns; `payments.transaction_reference` not unique; deleting a warehouse orphans its stock rows. | migrations, `WarehouseController.php:209` |

### Broken behavior
| # | Sev | Issue | Where |
|---|-----|-------|-------|
| B1 | 🟠 | Creating a user returns 500 after the row is saved (fires nonexistent `UserCreated` event). Role validation excludes 8 roles. No self-delete guard. | `Admin\UserController.php:57,47,111` |
| B2 | 🟠 | Nightly replenishment job never runs: nothing in Docker runs the scheduler or a queue worker. Discord ping is synchronous in middleware. | `routes/console.php`, `docker/*`, `NotifyPublicVisit.php:24` |
| B3 | 🟠 | Routes to missing controller methods (500): transfer create/store/show, warehouse show, inventory show, customer create/show/edit. | `admin.php:66,104-106`, `inventory.php:12,27` |
| B4 | 🟠 | Missing pages `Admin/Inventory/Stores/Create` and `Edit`. | `StoreController.php:72,278` |
| B5 | 🟡 | Bulk-session buttons call unregistered routes. | `Pages/Admin/Sessions/index.jsx:155-190`, `admin.php:70-73` |
| B6 | 🟡 | Dead sidebar and nav links (404) for Finance, Shared, Admin, Settings. | `FinanceSidebar.tsx:13`, `SharedSidebar.tsx:12`, `AdminSidebar.tsx:245`, `AdminNav.tsx:135` |
| B7 | 🟡 | Eight role welcome pages render blank; finished versions exist in `Pages/Welcome/*`. | `config/subdomains.php` |
| B8 | 🟡 | `ProcurementLayout.tsx` is 0 bytes; no `MarketingLayout`; Finance and Shared reuse the admin nav. | `Layouts/` |
| B9 | 🟡 | `store_manager` role has no subdomain; locked out once S1 is fixed. | `config/subdomains.php` |
| B10 | 🟡 | No-op buttons (cart Checkout, Edit address, Track Live, Download Manifest) and a no-op seller settings save. | see frontend audit |

### Housekeeping
| # | Sev | Issue |
|---|-----|-------|
| H1 | 🟡 | `docs` is a gitlink with no `.gitmodules`; breaks on fresh clone. |
| H2 | 🟡 | `.env.example` is gitignored and is stock Laravel (no project keys). |
| H3 | 🟡 | ~70 `$request->validate()` calls break the FormRequest rule. |
| H4 | ⚪ | 15+ unrouted controllers, unloaded route files, orphaned pages. |
| H5 | ⚪ | ~170 `console.log` calls (`Seller/Items/Index.tsx` ~50, `User/Contact` ~120); raw `style={{}}` widespread. |
| H6 | ⚪ | Junk deps: `install`, `npm`, duplicate `@inertiajs/react`; probably unused `@dnd-kit/*`, `@mui/x-charts`, `@tailwindcss/vite`. |
| H7 | ⚪ | Tracked clutter: `error.html`, `test_wh.php`, `test-tldraw.js`, `update_item_variants.cjs`. |
| H8 | 🟡 | No tests for role gate, Delivery, Vendor, Finance, Procurement, transfer stock math, middleware. |
| H9 | ⚪ | CLAUDE.md drift (67 module skeletons, not 61; new services unlisted); `backup-db.sh` timestamp format sorts badly and failed dumps overwrite `latest`. |

### UI-only screens (need backend)
| Area | State | Real code to connect |
|------|-------|----------------------|
| Storefront checkout | "coming soon" | `CheckoutService` exists, no controller calls it |
| Seller orders / confirmation / pay | Sample data (`Data/sellerOrderFlow.ts`) | `Sale`, `OrderSourcingService` |
| Admin Replenish (index, Build, Review, Dispatched) | Demo arrays, `dispatch()` TODO | `ShipmentWorkflowService::presentAsScheduledTransfer` |
| Finance dashboard and reports | Empty / static "$0.00" | `Sale`, `Payment` models |
| Procurement dashboard and purchase orders | Empty shells | `Procurement\Purchase` model |
| Marketing dashboard and campaigns | Empty shells | none yet |
| Shared dashboard | Static text | none yet |
| Admin settings / Seller settings | Theme toggle only / no-op save | none yet |
| Vendor console | Read-only | `VendorService` |

### Missing features
Payments and receipts, returns/RMA, purchase orders and goods receiving, finance reports (P&L, VAT, valuation), audit log, notifications (low stock, approvals, delivery), CSV/PDF exports and printables, stock counts and write-offs, UI to manage the 8 non-core roles, customer ledgers/credit, storefront order history/tracking, invite-only registration.

---

## Table 2: Your requested changes

| # | Request | What I found | Proposed approach | Size |
|---|---------|--------------|-------------------|------|
| R1 | All `deploy.sh` and `deploy-with-options.sh` commands from `docs/` easily accessible in dev | `docs/deploy.sh.md`, `docs/deploy-with-options.sh.md`, `docs/Docker.md` exist; dev subdomain already has `/dev/*` pages | New "Operations" page on the dev subdomain: buttons for each command with a description, run output streamed back, destructive ones (`--reset-db`, `--clean`) behind a typed confirmation. Needs an allow-listed runner (no free-form shell), dev env only. Also a `Makefile` or `bin/duka` shortcut as a CLI fallback. | M |
| R2 | Fix sessions: logging in far too often, make it last longer | `SESSION_LIFETIME=8640` (6 days) is already set. The real causes are likely: `SESSION_DOMAIN=null` (one cookie per subdomain, so each role host has its own login); `--reset-db`/`--clean` redeploys wipe the `sessions` table; the cookie name `duka_session_dev` differs between dev and prod; `expire_on_close` and `ScopeSessionToHost`/`separated_session_hosts` also affect it. Admin Sessions page is also broken (B5, S2). | Decide on shared login across subdomains (`SESSION_DOMAIN=.duka.test`) vs separate per role; add "remember me" by default; stop redeploys from wiping sessions; fix the admin session screens and scope them to the user's own sessions. | M |
| R3 | Make `dev.duka.test:8095/dashboard` a real backend dashboard (not just logs) | `/dashboard` is a closure in `routes/web/dev/dev.php:29`, no props | Server health (containers, DB, queue, scheduler, disk), app stats (users per role, sessions, stock totals, open transfers/shipments, sales today), recent errors, failed jobs, quick links to Operations (R1), and the architecture map. | M-L |
| R4 | Make `dev.duka.test:8095/shipments` visually appealing; make shipment, delivery, stock and sales understandable | `/shipments` is a closure rendering `Dev/Shipments/index.tsx` ("Fulfillment sandbox placeholder") | Pipeline board (order → sourcing → shipment → delivery → delivered) with counts, a stock-flow view per location, sales-to-delivery timeline, and drill-down per shipment. Uses real data from `ShipmentWorkflowService`, `DeliveryService`, `StockService`. | L |

---

## Suggested order
1. S1-S3, S4-S5, S6-S7 (security)
2. D1-D5 (stock integrity) and B1-B2
3. R2 (sessions), since it is annoying daily and partly tied to S2/B5
4. R1 (operations page), R3 (dashboard), R4 (shipments)
5. B3-B10 and UI-only wiring, then housekeeping
