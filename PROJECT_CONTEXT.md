# Project Context: Duka

## 1. Executive Summary
- **Goal:** A modular commerce and inventory management system designed for merchants, featuring multi-role access (Admin, Seller, Stockkeeper, etc.).
- **Current Status:** Active development.

## 2. Folder Structure (Tree)

```text
.
├── DESIGN.md
├── PROJECT_CONTEXT.md
├── README.md
├── app
│   ├── Http
│   │   ├── Controllers
│   │   ├── Middleware
│   │   └── Requests
│   ├── Models
│   │   ├── Auth
│   │   ├── Delivery
│   │   ├── Finance
│   │   ├── Inventory
│   │   ├── Item
│   │   ├── Procurement
│   │   ├── Seller
│   │   ├── Shared
│   │   ├── StockKeeper
│   │   ├── Store
│   │   └── Vendor
│   ├── Policies
│   │   └── Seller
│   ├── Providers
│   │   ├── AppServiceProvider.php
│   │   └── AuthEventServiceProvider.php
│   └── Services
│       ├── CartService.php
│       ├── DiscordVisitNotificationService.php
│       ├── ImageResolver.php
│       ├── ItemVariantGenerationService.php
│       └── PriceProvider.php
├── artisan
├── backend_map.txt
├── bootstrap
│   ├── app.php
│   └── providers.php
├── composer.json
├── composer.lock
├── config
│   ├── app.php
│   ├── auth.php
│   ├── cache.php
│   ├── database.php
│   ├── filesystems.php
│   ├── logging.php
│   ├── mail.php
│   ├── permission.php
│   ├── queue.php
│   ├── sentry.php
│   ├── services.php
│   ├── session.php
│   └── subdomains.php
├── database
│   ├── database.sqlite
│   ├── factories
│   │   ├── Category
│   │   ├── Customer
│   │   ├── Finance
│   │   ├── Inventory
│   │   ├── Item
│   │   ├── ItemFactory.php
│   │   ├── ItemVariantFactory.php
│   │   ├── Marketing
│   │   ├── Procurement
│   │   ├── Sales
│   │   ├── Shared
│   │   ├── Store
│   │   ├── StoreVariantFactory.php
│   │   ├── User
│   │   └── Vendor
│   ├── migrations
│   │   ├── 0000_01_01_000000_create_stores_table.php
│   │   ├── 0000_01_02_000000_create_item_inventory_locations_table.php
│   │   ├── 0000_01_03_000000_create_users_table.php
│   │   ├── 0000_01_03_032131_create_item_categories_table.php
│   │   ├── 0000_01_04_000000_create_items_table.php
│   │   ├── 0000_01_05_000000_create_item_colors_table.php
│   │   ├── 0000_01_06_000000_create_item_sizes_table.php
│   │   ├── 0000_01_07_000000_create_item_packaging_types_table.php
│   │   ├── 0000_01_08_000000_create_item_variants_table.php
│   │   ├── 0000_01_09_000000_create_store_variants_table.php
│   │   ├── 0001_01_01_000001_create_cache_table.php
│   │   ├── 0001_01_01_000002_create_jobs_table.php
│   │   ├── 2024_12_18_233953_create_user_management_table.php
│   │   ├── 2024_12_19_003325_create_sales_table.php
│   │   ├── 2024_12_19_004638_create_purchases_table.php
│   │   ├── 2024_12_21_001858_create_customers_table.php
│   │   ├── 2024_12_24_000056_create_carts_table.php
│   │   ├── 2024_12_24_000850_create_cart_items_table.php
│   │   ├── 2025_01_08_011344_create_telescope_entries_table.php
│   │   ├── 2025_01_13_032326_create_item_images_table.php
│   │   ├── 2025_01_13_032330_create_item_variant_packaging_quantity_table.php
│   │   ├── 2025_01_13_032342_create_item_owners_table.php
│   │   ├── 2025_01_13_032354_create_item_stocks_table.php
│   │   ├── 2025_01_13_032400_create_item_prices_table.php
│   │   ├── 2025_01_29_025744_create_item_category_item_table.php
│   │   ├── 2025_02_01_230400_create_item_images_describtion_table.php
│   │   ├── 2025_10_27_093034_add_status_to_carts_table.php
│   │   ├── 2025_11_04_043619_create_item_color_item_table.php
│   │   ├── 2025_11_04_043619_create_item_item_size_table.php
│   │   ├── 2025_11_04_043619_create_item_packaging_type_item_table.php
│   │   ├── 2025_11_04_061416_create_store_variants_customer_prices_table.php
│   │   ├── 2025_11_14_223238_create_stocks_table.php
│   │   ├── 2025_12_02_044855_create_customer_prices_table.php
│   │   ├── 2025_12_02_045035_create_seller_prices_table.php
│   │   ├── 2025_12_02_045537_create_store_variants_seller_prices_table.php
│   │   ├── 2025_12_04_032449_add_remember_me_to_sessions_table.php
│   │   ├── 2025_12_14_040138_create_item_store_table.php
│   │   ├── 2026_02_25_033150_create_permission_tables.php
│   │   ├── 2026_02_26_140231_create_sessions_table.php
│   │   ├── 2026_05_05_072044_create_transfers_table.php
│   │   └── 2026_05_09_040815_create_warehouses_table.php
│   └── seeders
│       ├── Admin
│       ├── Auth
│       ├── Customer
│       ├── DatabaseSeeder.php
│       ├── Delivery
│       ├── Finance
│       ├── Inventory
│       ├── Marketing
│       ├── PackagingTypeSeeder.php
│       ├── Procurement
│       ├── Seller
│       ├── StockKeeper
│       ├── Store
│       ├── User
│       └── Vendor
├── deploy-with-options.sh
├── deploy.sh
├── docker
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   ├── docker-compose.dev.yml
│   ├── docker-compose.observability.yml
│   ├── docker-compose.prod.yml
│   ├── docker-compose.yml
│   ├── docker-entrypoint.sh
│   ├── nginx.conf
│   └── promtail-config.yaml
├── docs
│   ├── item.excalidraw.png
│   ├── noteDuka1.3.0.md
│   ├── noteDuka1.3.0docker.md
│   ├── notemdfile.md
│   └── observability.md
├── frontend_map.txt
├── jsconfig.json
├── logs
│   ├── deploy_20260605_020236.log
│   ├── deploy_20260605_050506.log
│   ├── deploy_20260623_061334.log
│   └── deploy_20260623_061623.log
├── package-lock.json
├── package.json
├── phpunit.xml
├── postcss.config.js
├── public
│   ├── downloads
│   ├── favicon.ico
│   ├── hot
│   ├── images
│   │   ├── 1828533.png
│   │   ├── addtocartbutton.svg
│   │   ├── default.jpg
│   │   ├── defaults
│   │   ├── homepage
│   │   ├── icons8-dashboard-50.png
│   │   ├── images
│   │   ├── items
│   │   └── product_images
│   ├── index.php
│   ├── logo.jpeg
│   ├── no-image.png
│   ├── robots.txt
│   └── uploads
│       └── variants
├── resources
│   ├── css
│   │   └── app.css
│   ├── js
│   │   ├── Components
│   │   ├── Layouts
│   │   ├── Pages
│   │   ├── app.tsx
│   │   ├── bootstrap.js
│   │   ├── theme
│   │   ├── theme.ts
│   │   ├── types
│   │   └── vite-env.d.ts
│   ├── theme
│   └── views
│       └── app.blade.php
├── routes
│   ├── auth.php
│   ├── console.php
│   ├── web
│   │   ├── admin
│   │   ├── delivery
│   │   ├── dev
│   │   ├── errors
│   │   ├── finance
│   │   ├── guest
│   │   ├── marketing
│   │   ├── procurement
│   │   ├── seller
│   │   ├── shared
│   │   └── stockkeeper
│   └── web.php
├── smart_context.txt
├── tailwind.config.js
├── tests
│   ├── Feature
│   │   ├── Admin
│   │   ├── Auth
│   │   ├── ExampleTest.php
│   │   ├── ProfileTest.php
│   │   └── Seller
│   ├── TestCase.php
│   └── Unit
│       ├── ExampleTest.php
│       └── PostRepositoryTest.php
├── tsconfig.json
└── vite.config.js

95 directories, 221 files
```

## Admin Routes

<details>
<summary>Click to expand</summary>

```text
GET|HEAD  admin.duka.test/ ............................. admin.welcome
GET|HEAD  delivery.duka.test/ ....................... delivery.welcome
GET|HEAD  dev.duka.test/ ................................. dev.welcome
GET|HEAD  finance.duka.test/ ......................... finance.welcome
GET|HEAD  marketing.duka.test/ ..................... marketing.welcome
GET|HEAD  procurement.duka.test/ ................. procurement.welcome
GET|HEAD  seller.duka.test/ ........................... seller.welcome
GET|HEAD  shared.duka.test/ ........................... shared.welcome
GET|HEAD  stockkeeper.duka.test/ ................ stock_keeper.welcome
GET|HEAD  vendor.duka.test/ ........................... vendor.welcome
GET|HEAD  / .............................. generated::mAsBSwjRJo3tSYpJ
GET|HEAD  _debugbar/assets ......................... debugbar.assets
DELETE    _debugbar/cache/{key} ................. debugbar.cache.delete
GET|HEAD  _debugbar/clockwork/{id} .............. debugbar.clockwork
GET|HEAD  _debugbar/open ........................ debugbar.openhandler
POST      _debugbar/queries/explain ............. debugbar.queries.explain
GET|HEAD  about ................................................ about
GET|HEAD  marketing.duka.test/campaigns .......... marketing.campaigns.index
GET|HEAD  admin.duka.test/carts .................. admin.carts.index
POST      admin.duka.test/carts .................. admin.carts.store
GET|HEAD  seller.duka.test/carts ................. seller.carts.index
POST      seller.duka.test/carts ................. seller.carts.store
GET|HEAD  admin.duka.test/carts/create ........... admin.carts.create
GET|HEAD  seller.duka.test/carts/create .......... seller.carts.create
POST      seller.duka.test/carts/reorder ......... seller.carts.reorder
GET|HEAD  seller.duka.test/carts/{cart} .......... seller.carts.show
PUT|PATCH seller.duka.test/carts/{cart} .......... seller.carts.update
DELETE    seller.duka.test/carts/{cart} .......... seller.carts.destroy
GET|HEAD  seller.duka.test/carts/{cart}/edit ..... seller.carts.edit
POST      seller.duka.test/carts/{cart}/items .... seller.carts.items.store
DELETE    seller.duka.test/carts/{cart}/items/{variant} ... seller.carts.items.destroy
GET|HEAD  admin.duka.test/carts/{id} ............. admin.carts.show
DELETE    admin.duka.test/carts/{id} ............. admin.carts.destroy
GET|HEAD  seller.duka.test/categories ............ seller.categories.index
GET|HEAD  seller.duka.test/categories/{category} . seller.categories.show
GET|HEAD  confirm-password ........................ password.confirm
POST      confirm-password ........................ generated::Rz33kTa7rDy5S0TI
GET|HEAD  contact ............................................ contact
GET|HEAD  seller.duka.test/customers ............. seller.customers.index
POST      seller.duka.test/customers ............. seller.customers.store
GET|HEAD  seller.duka.test/customers/create ...... seller.customers.create
GET|HEAD  seller.duka.test/customers/{customer} .. seller.customers.show
PUT|PATCH seller.duka.test/customers/{customer} .. seller.customers.update
DELETE    seller.duka.test/customers/{customer} .. seller.customers.destroy
GET|HEAD  seller.duka.test/customers/{customer}/edit ... seller.customers.edit
GET|HEAD  admin.duka.test/dashboard .............. admin.dashboard
GET|HEAD  delivery.duka.test/dashboard ............ delivery.dashboard
GET|HEAD  dev.duka.test/dashboard ...................... dev.dashboard
GET|HEAD  finance.duka.test/dashboard .............. finance.dashboard
GET|HEAD  marketing.duka.test/dashboard .......... marketing.dashboard
GET|HEAD  procurement.duka.test/dashboard ...... procurement.dashboard
GET|HEAD  seller.duka.test/dashboard ............. seller.dashboard
GET|HEAD  shared.duka.test/dashboard ................ shared.dashboard
GET|HEAD  stockkeeper.duka.test/dashboard ........ stock_keeper.dashboard
GET|HEAD  vendor.duka.test/dashboard ................ vendor.dashboard
GET|HEAD  dashboard .................................. guest.dashboard
GET|HEAD  marketing.duka.test/debug-host .................. marketing.
GET|HEAD  shared.duka.test/debug-host ........................ shared.
GET|HEAD  shared.duka.test/debug-middleware ..... shared.generated::ZK5RaAw…
GET|HEAD  delivery.duka.test/delivery ........... delivery.delivery.index
GET|HEAD  downloads ...................... generated::xm19UUpNOhCileVw
POST      email/verification-notification ......... verification.send
GET|HEAD  forgot-password ......................... password.request
POST      forgot-password ......................... password.email
GET|HEAD  home .................................................. home
GET|HEAD  home2 ................................................ home2
GET|HEAD  homepage .......................................... homepage
GET|HEAD  inventory ......................... inventory.index
GET|HEAD  stockkeeper.duka.test/inventory ........ stock_keeper.inventory.index
GET|HEAD  inventory/show/{store} ................. inventory.show
GET|HEAD  admin.duka.test/inventory/stores ....... inventory.stores
GET|HEAD  admin.duka.test/inventory/transfers .... inventory.transfers
POST      admin.duka.test/inventory/transfers .... admin.inventory.transfers.store
GET|HEAD  admin.duka.test/inventory/transfers/create ... admin.inventory.transfers.create
GET|HEAD  admin.duka.test/inventory/transfers/{transfer} ... admin.inventory.transfers.show
PATCH     admin.duka.test/inventory/transfers/{transfer}/cancel ... admin.inventory.transfers.cancel
PATCH     admin.duka.test/inventory/transfers/{transfer}/complete ... admin.inventory.transfers.complete
GET|HEAD  admin.duka.test/inventory/warehouse .... inventory.warehouse
GET|HEAD  inventory/warehouse .................... admin.inventory.warehouse.index
POST      inventory/warehouse .................... admin.inventory.warehouse.store
GET|HEAD  inventory/warehouse/create ............. admin.inventory.warehouse.create
POST      admin.duka.test/inventory/warehouse/locations ... admin.inventory.locations.store
GET|HEAD  admin.duka.test/inventory/warehouse/locations/create ... admin.inventory.locations.create
PATCH     admin.duka.test/inventory/warehouse/locations/{location} ... admin.inventory.locations.update
DELETE    admin.duka.test/inventory/warehouse/locations/{location} ... admin.inventory.locations.destroy
GET|HEAD  admin.duka.test/inventory/warehouse/locations/{location}/edit ... admin.inventory.locations.edit
PUT       inventory/warehouse/{warehouse} ........ admin.inventory.warehouse.update
DELETE    inventory/warehouse/{warehouse} ........ admin.inventory.warehouse.destroy
GET|HEAD  inventory/warehouse/{warehouse} ........ admin.inventory.warehouse.show
GET|HEAD  inventory/warehouse/{warehouse}/edit ... admin.inventory.warehouse.edit
GET|HEAD  admin.duka.test/items .................. admin.items.index
POST      admin.duka.test/items .................. admin.items.store
GET|HEAD  seller.duka.test/items ................. seller.items.index
GET|HEAD  admin.duka.test/items/create ........... admin.items.create
POST      admin.duka.test/items/inline-options ... admin.items.inline-options
GET|HEAD  seller.duka.test/items/page-json ....... seller.items.page-json
GET|HEAD  seller.duka.test/items/search .......... seller.items.search
GET|HEAD  admin.duka.test/items/{item} ........... admin.items.show
PUT|PATCH admin.duka.test/items/{item} ........... admin.items.update
DELETE    admin.duka.test/items/{item} ........... admin.items.destroy
GET|HEAD  seller.duka.test/items/{item} .......... seller.items.show
POST      admin.duka.test/items/{item}/deploy .... admin.items.deploy
GET|HEAD  admin.duka.test/items/{item}/edit ...... admin.items.edit
DELETE    admin.duka.test/items/{item}/variants/{variant} ... admin.items.variants.destroy
PATCH     admin.duka.test/items/{item}/variants/{variant}/status ... admin.items.variants.status
GET|HEAD  dev.duka.test/lesson4 .................. dev.lesson4.index
GET|HEAD  lesson4 ...................................... lesson4.index
GET|HEAD  dev.duka.test/lesson6 .................. dev.lesson6.index
POST      dev.duka.test/lesson6 .................. dev.lesson6.store
GET|HEAD  lesson6 ................................ lesson6.index
POST      lesson6 ................................ lesson6.store
GET|HEAD  dev.duka.test/lesson6/create ........... dev.lesson6.create
GET|HEAD  lesson6/create ......................... lesson6.create
GET|HEAD  dev.duka.test/lesson6/{lesson6} ........ dev.lesson6.show
PUT|PATCH dev.duka.test/lesson6/{lesson6} ........ dev.lesson6.update
DELETE    dev.duka.test/lesson6/{lesson6} ........ dev.lesson6.destroy
GET|HEAD  lesson6/{lesson6} ...................... lesson6.show
PUT|PATCH lesson6/{lesson6} ...................... lesson6.update
DELETE    lesson6/{lesson6} ...................... lesson6.destroy
GET|HEAD  dev.duka.test/lesson6/{lesson6}/edit ... dev.lesson6.edit
GET|HEAD  lesson6/{lesson6}/edit ................. lesson6.edit
GET|HEAD  login ................................... login
POST      login .................................... generated::E5SyyCPGfNUGafrm
GET|HEAD  admin.duka.test/login ...................... admin.login
GET|HEAD  delivery.duka.test/login .................... delivery.login
GET|HEAD  dev.duka.test/login .......................... dev.login
GET|HEAD  finance.duka.test/login ...................... finance.login
GET|HEAD  marketing.duka.test/login .................. marketing.login
GET|HEAD  procurement.duka.test/login .............. procurement.login
GET|HEAD  seller.duka.test/login ........................ seller.login
GET|HEAD  shared.duka.test/login ........................ shared.login
GET|HEAD  stockkeeper.duka.test/login ............. stock_keeper.login
GET|HEAD  vendor.duka.test/login ........................ vendor.login
POST      logout .................................. logout
GET|HEAD  seller.duka.test/menu ................... seller.menu.index
GET|HEAD  seller.duka.test/orders ................. seller.orders.index
GET|HEAD  stockkeeper.duka.test/orders ............ stock_keeper.orders.index
PUT       password ................................ password.update
GET|HEAD  delivery.duka.test/profile .............. delivery.profile.index
GET|HEAD  procurement.duka.test/purchase-orders ... procurement.purchase_orders.index
GET|HEAD  register ............................... register
POST      register ................................ generated::x1ausFmoRjBssgNZ
GET|HEAD  finance.duka.test/reports .............. finance.reports.index
POST      reset-password .......................... password.store
GET|HEAD  reset-password/{token} .................. password.reset
GET|HEAD  sanctum/csrf-cookie ..................... sanctum.csrf-cookie
GET|HEAD  admin.duka.test/sessions ................ admin.sessions.index
GET|HEAD  delivery.duka.test/sessions ............. delivery.sessions.index
GET|HEAD  dev.duka.test/sessions .................. dev.sessions.index
GET|HEAD  finance.duka.test/sessions .............. finance.sessions.index
GET|HEAD  marketing.duka.test/sessions ............ marketing.sessions.index
GET|HEAD  sessions ................................ sessions.index
DELETE    admin.duka.test/sessions/{id} ........... admin.sessions.destroy
DELETE    delivery.duka.test/sessions/{id} ........ delivery.sessions.destroy
DELETE    dev.duka.test/sessions/{id} ............. dev.sessions.destroy
DELETE    finance.duka.test/sessions/{id} ......... finance.sessions.destroy
DELETE    marketing.duka.test/sessions/{id} ....... marketing.sessions.destroy
DELETE    sessions/{id} ............................ sessions.destroy
GET|HEAD  admin.duka.test/settings .................... admin.settings
GET|HEAD  seller.duka.test/settings ............... seller.settings.index
PATCH     seller.duka.test/settings ............... seller.settings.update
GET|HEAD  delivery.duka.test/shipments ............ delivery.shipments.index
GET|HEAD  dev.duka.test/shipments ................. dev.shipments.index
GET|HEAD  stockkeeper.duka.test/stock-alerts ...... stock_keeper.alerts.index
GET|HEAD  storage/{path} ............................... storage.local
DELETE    admin.duka.test/store-variant-customer-prices/{price} ... store-variant-customer-prices.destroy
DELETE    admin.duka.test/store-variant-seller-prices/{price} ... store-variant-seller-prices.destroy
PATCH     admin.duka.test/store-variants/{storeVariant} ... store-variant.update
POST      admin.duka.test/store-variants/{storeVariant}/customer-prices ... store-variant.customer-price.upsert
POST      admin.duka.test/store-variants/{storeVariant}/seller-prices ... store-variant.seller-price.upsert
GET|HEAD  admin.duka.test/stores .................. store.index
POST      admin.duka.test/stores .................. store.store
GET|HEAD  admin.duka.test/stores/create ........... store.create
GET|HEAD  admin.duka.test/stores/{store} .......... store.show
PUT|PATCH admin.duka.test/stores/{store} .......... admin.stores.update
DELETE    admin.duka.test/stores/{store} .......... store.destroy
PATCH     admin.duka.test/stores/{store} .......... store.update
GET|HEAD  admin.duka.test/stores/{store}/edit ..... store.edit
GET|HEAD  up ..................................... generated::WaIQN5Dg69brxlXs
GET|HEAD  admin.duka.test/users .................. admin.users.index
POST      admin.duka.test/users .................. admin.users.store
GET|HEAD  admin.duka.test/users/create ........... admin.users.create
GET|HEAD  admin.duka.test/users/{user} ........... admin.users.show
PUT|PATCH admin.duka.test/users/{user} ........... admin.users.update
DELETE    admin.duka.test/users/{user} ........... admin.users.destroy
GET|HEAD  admin.duka.test/users/{user}/edit ...... admin.users.edit
GET|HEAD  verify-email ........................... verification.notice
GET|HEAD  verify-email/{id}/{hash} ............... verification.verify
GET|HEAD  {fallbackPlaceholder} .................. generated::T5xiLJz8KC8SloZN
```

</details>

## 3. Roadmap & Recent Changes
- [ ] Initializing project structure.

## 4. Key Notes
- [Add any critical project-wide rules or constraints here]

## 5. Coding Standards & Conventions
- **Controllers:** Keep them thin; business logic belongs in `app/Services/`.
- **Frontend:** Use React with TypeScript. Use `theme.ts` for consistent styling.
- **Imports:** Use absolute paths (e.g., `@/Components/...`).
- **Database:** All new features must have a corresponding migration and factory.
- **Docker:** If you change a dependency, run `docker compose build` to update the dev image.

## 6. Current Focus & Blockers
- **Primary Goal:** [Insert your current sprint focus here]
- **Current Blocker:** [Describe the immediate error or hurdle you're facing]

## 7. Useful Deployment & Debug Commands

### Infrastructure & Migrations
- **Fresh Deployment:** 
  `docker exec duka-app php artisan migrate:fresh --seed --force`
- **Standard Migration:** 
  `docker exec duka-app php artisan migrate --force`
- **Seeding:** 
  `docker exec duka-app php artisan db:seed --force`

### Application Cache & Routes
- **Clear Everything:** 
  `docker exec duka-app php artisan optimize:clear`
- **Clear Routes:** 
  `docker exec duka-app php artisan route:clear`
- **Clear Cache:** 
  `docker exec duka-app php artisan cache:clear`
- **Clear Config:** 
  `docker exec duka-app php artisan config:clear`

### Observability & Debugging
- **Check Vite Logs:** 
  `docker exec duka-app cat /tmp/vite.log`
- **Check Vite Process:** 
  `docker exec duka-app ps aux | grep vite`
- **Check Container Health:** 
  `docker inspect duka-app | grep -A 10 "State"`