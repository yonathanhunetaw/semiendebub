<?php

declare(strict_types=1);

namespace App\Services\DataExchange;

use App\Services\DataExchange\Datasets\CategoriesDataset;
use App\Services\DataExchange\Datasets\ExpensesDataset;
use App\Services\DataExchange\Datasets\ItemLevelsDataset;
use App\Services\DataExchange\Datasets\ItemsDataset;
use App\Services\DataExchange\Datasets\OptionNamesDataset;
use App\Services\DataExchange\Datasets\StockCountsDataset;
use App\Services\DataExchange\Datasets\StorePricesDataset;
use App\Services\DataExchange\Datasets\SuppliersDataset;
use App\Services\DataExchange\Datasets\TariffsDataset;
use App\Services\DataExchange\Datasets\VariantsDataset;
use App\Services\Finance\ExpenseService;
use App\Services\Inventory\CatalogueSheet;
use App\Services\Inventory\LocationLevels;
use App\Services\Inventory\PackagingLadder;
use App\Services\Inventory\ShelfMatrix;
use App\Services\Inventory\StocktakeService;
use App\Services\Item\ItemWriter;
use App\Services\Item\StorePrices;
use Illuminate\Support\Facades\Schema;

/**
 * Every dataset the Settings → Import / Export page offers, grouped by area. Hand-written datasets
 * (the importable ones) come first; everything else is an export-only table, so each model area
 * of the app can be downloaded. A key written by hand wins over the same key in the table list.
 */
final class DatasetRegistry
{
    private const LEDGER = 'Export only: a record of what happened, changed only by the app itself';

    private const MONEY = 'Export only: money, confirmed by two different people in the app';

    private const FLOW = 'Export only: its status is owned by the app\'s workflow, not by a file';

    /** @var array<string, Dataset>|null */
    private ?array $datasets = null;

    /** @return array<string, Dataset> key => dataset */
    public function all(): array
    {
        if ($this->datasets !== null) {
            return $this->datasets;
        }

        $list = [
            new CategoriesDataset(),
            new OptionNamesDataset('item_colors', 'Colours', $this->model('Item\\ItemColor'), 'Teal'),
            new OptionNamesDataset('item_sizes', 'Sizes', $this->model('Item\\ItemSize'), 'Large'),
            new OptionNamesDataset('item_packaging_types', 'Packaging types', $this->model('Item\\ItemPackagingType'), 'Carton'),
            new ItemsDataset(app(ItemWriter::class)),
            new VariantsDataset(app(ItemWriter::class)),
            new ItemLevelsDataset(app(ShelfMatrix::class), app(LocationLevels::class), app(PackagingLadder::class), app(CatalogueSheet::class)),
            new StockCountsDataset(app(StocktakeService::class), app(CatalogueSheet::class)),
            new StorePricesDataset(app(StorePrices::class)),
            new ExpensesDataset(app(ExpenseService::class)),
            new SuppliersDataset(),
            new TariffsDataset(),
        ];
        foreach ($this->tables() as [$key, $label, $group, $model, $description, $why]) {
            // A legacy model whose table is gone has nothing to export.
            if (class_exists($model) && Schema::hasTable((new $model())->getTable())) {
                $list[] = new TableDataset($key, $label, $group, $model, $description, $why);
            }
        }

        $byKey = [];
        foreach ($list as $dataset) {
            $byKey[$dataset->key()] ??= $dataset;
        }

        return $this->datasets = $byKey;
    }

    private function model(string $class): string
    {
        return 'App\\Models\\'.$class;
    }

    public function find(string $key): ?Dataset
    {
        return $this->all()[$key] ?? null;
    }

    /** @return array<string, list<Dataset>> group => datasets, in the order the page shows them */
    public function grouped(): array
    {
        $groups = [];
        foreach ($this->all() as $dataset) {
            $groups[$dataset->group()][] = $dataset;
        }
        $order = array_flip(['Items', 'Store', 'Inventory', 'Seller', 'Fulfillment', 'Procurement', 'Finance', 'Workforce', 'Calendar', 'People']);
        uksort($groups, fn (string $a, string $b): int => ($order[$a] ?? 99) <=> ($order[$b] ?? 99));

        return $groups;
    }

    /** @return list<array{0: string, 1: string, 2: string, 3: string, 4: string, 5: string}> key, label, group, model, description, why */
    private function tables(): array
    {
        $m = fn (string $class): string => 'App\\Models\\'.$class;
        $setup = 'Export only for now';

        return [
            // Items
            // Store
            ['stores', 'Stores', 'Store', $m('Store\\Store'), 'The shops.', $setup],
            ['business_settings', 'Business rules', 'Store', $m('Admin\\BusinessSetting'), 'The rules set in Settings → Business rules (empty = the default).', 'Export only: rules are changed on the Business rules screen'],
            ['store_variants', 'Store variants', 'Store', $m('Store\\StoreVariant'), 'What each store sells, and whether it is switched on.', 'Export only: stock and status are worked out by the app'],
            ['store_variant_seller_prices', 'Seller prices (per store)', 'Store', $m('Store\\StoreVariantSellerPrice'), 'Prices sellers charge, per store variant.', self::MONEY],
            ['store_variant_customer_prices', 'Customer prices (per store)', 'Store', $m('Store\\StoreVariantCustomerPrice'), 'Prices customers pay, per store variant.', self::MONEY],
            ['store_variant_individual_prices', 'Individual prices (per store)', 'Store', $m('Store\\StoreVariantIndividualPrice'), 'Prices set for one buyer, per store variant.', self::MONEY],
            ['store_variant_capacities', 'Shelf capacities', 'Store', $m('Store\\StoreVariantCapacity'), 'How much of each variant a store holds.', $setup],
            // Inventory
            ['warehouses', 'Warehouses', 'Inventory', $m('Inventory\\Warehouse'), 'The warehouses.', $setup],
            ['floor_areas', 'Floor areas', 'Inventory', $m('Inventory\\FloorArea'), 'Areas of a shop floor.', $setup],
            ['stock_locations', 'Stock locations', 'Inventory', $m('Inventory\\StockLocation'), 'Every place stock can sit.', $setup],
            ['item_refill_routes', 'Refill routes', 'Inventory', $m('Inventory\\ItemRefillRoute'), 'Where each item is refilled from.', $setup],
            ['shelf_item_bands', 'Shelf bands', 'Inventory', $m('Inventory\\ShelfItemBand'), 'The planogram: which item sits in which shelf band.', $setup],
            ['facility_managers', 'Location managers', 'Inventory', $m('Inventory\\FacilityManager'), 'Who manages which location.', 'Export only: changed in the Users and Stores screens'],
            ['location_staff', 'Location staff', 'Inventory', $m('Inventory\\LocationStaff'), 'Who works at which location.', 'Export only: changed in the Users and Stores screens'],
            ['item_stocks', 'Stock on hand', 'Inventory', $m('Inventory\\ItemStock'), 'How many pieces of each variant sit in each place now.', 'Export only: stock changes only through a stock count'],
            ['inventory_movements', 'Stock movements (ledger)', 'Inventory', $m('Inventory\\InventoryMovement'), 'Every stock change, with the balance after it.', self::LEDGER],
            ['stocktakes', 'Stock counts', 'Inventory', $m('Inventory\\Stocktake'), 'Counting sessions.', self::FLOW],
            ['stocktake_lines', 'Stock count lines', 'Inventory', $m('Inventory\\StocktakeLine'), 'What was counted, line by line.', self::FLOW],
            ['stock_reservations', 'Stock reservations', 'Inventory', $m('Inventory\\StockReservation'), 'Stock held for orders.', self::FLOW],
            ['refill_requests', 'Refill requests', 'Inventory', $m('Inventory\\RefillRequest'), 'Requests to refill shelves.', self::FLOW],
            ['receipt_discrepancies', 'Receipt discrepancies', 'Inventory', $m('Inventory\\ReceiptDiscrepancy'), 'Differences found when goods arrived.', self::FLOW],
            ['transfers', 'Transfers', 'Inventory', $m('StockKeeper\\Transfer'), 'Stock moved between places.', self::FLOW],
            // Seller
            ['orders', 'Orders', 'Seller', $m('Seller\\Order'), 'Customer orders.', self::FLOW],
            ['seller_prices', 'Seller prices', 'Seller', $m('Seller\\SellerPrice'), 'Prices per seller.', self::MONEY],
            ['customer_prices', 'Customer prices', 'Seller', $m('Seller\\CustomerPrice'), 'Prices per customer.', self::MONEY],
            // Fulfillment
            ['shipments', 'Shipments', 'Fulfillment', $m('Fulfillment\\Shipment'), 'Goods sent between places.', self::FLOW],
            ['shipment_items', 'Shipment items', 'Fulfillment', $m('Fulfillment\\ShipmentItem'), 'The lines of each shipment.', self::FLOW],
            ['deliveries', 'Deliveries', 'Fulfillment', $m('Fulfillment\\Delivery'), 'Deliveries to customers.', self::FLOW],
            ['vehicles', 'Vehicles', 'Fulfillment', $m('Fulfillment\\Vehicle'), 'The fleet.', $setup],
            // Procurement
            ['shops', 'Market shops', 'Procurement', $m('Procurement\\Shop'), 'The other shops in the market that sellers price-check.', $setup],
            ['exchange_rates', 'Exchange rates', 'Procurement', $m('Procurement\\ExchangeRate'), 'Currency rates used for landed cost.', $setup],
            ['freight_routes', 'Freight routes', 'Procurement', $m('Procurement\\FreightRoute'), 'Shipping routes and their rates.', $setup],
            ['procurement_settings', 'Procurement settings', 'Procurement', $m('Procurement\\ProcurementSetting'), 'Procurement defaults.', $setup],
            ['product_ideas', 'Product ideas', 'Procurement', $m('Procurement\\ProductIdea'), 'Ideas for new products.', self::FLOW],
            ['price_checks', 'Price checks', 'Procurement', $m('Procurement\\PriceCheck'), 'Price check requests.', self::FLOW],
            ['price_observations', 'Price observations', 'Procurement', $m('Procurement\\PriceObservation'), 'Prices seen in other shops.', self::FLOW],
            ['supplier_quotes', 'Supplier quotes', 'Procurement', $m('Procurement\\SupplierQuote'), 'Quotes with their landed-cost estimate.', self::FLOW],
            ['purchases', 'Purchase orders', 'Procurement', $m('Procurement\\Purchase'), 'Orders placed with suppliers.', self::FLOW],
            ['purchase_lines', 'Purchase order lines', 'Procurement', $m('Procurement\\PurchaseLine'), 'The lines of each purchase order.', self::FLOW],
            ['consignments', 'Consignments', 'Procurement', $m('Procurement\\Consignment'), 'Goods on the way in.', self::FLOW],
            ['consignment_lines', 'Consignment lines', 'Procurement', $m('Procurement\\ConsignmentLine'), 'The lines of each consignment.', self::FLOW],
            ['consignment_costs', 'Consignment costs', 'Procurement', $m('Procurement\\ConsignmentCost'), 'Freight, duty and other costs.', self::MONEY],
            ['item_cost_entries', 'Item cost history', 'Procurement', $m('Procurement\\ItemCostEntry'), 'The weighted-average cost ledger.', self::LEDGER],
            ['supplier_payables', 'Supplier payables', 'Procurement', $m('Procurement\\SupplierPayable'), 'What is owed to suppliers.', self::MONEY],
            ['payable_installments', 'Payable installments', 'Procurement', $m('Procurement\\PayableInstallment'), 'The instalments of each payable.', self::MONEY],
            ['supplier_payments', 'Supplier payments', 'Procurement', $m('Procurement\\SupplierPayment'), 'Payments to suppliers.', self::MONEY],
            // Finance
            ['expenses', 'Expenses', 'Finance', $m('Finance\\Expense'), 'Money spent, claimed and confirmed.', self::MONEY],
            ['payment_accounts', 'Payment accounts', 'Finance', $m('Finance\\PaymentAccount'), 'The accounts payments go to.', 'Export only: account owners confirm payments, so they are changed on the Accounts screen'],
            ['payments', 'Payments', 'Finance', $m('Finance\\Payment'), 'Money received for sales.', self::MONEY],
            ['balance_entries', 'Balance entries', 'Finance', $m('Finance\\BalanceEntry'), 'Each person\'s balance ledger.', self::LEDGER],
            ['remittances', 'Remittances', 'Finance', $m('Finance\\Remittance'), 'Cash handed in.', self::MONEY],
            ['sales', 'Sales', 'Finance', $m('Finance\\Sale'), 'Sales.', self::MONEY],
            ['sale_items', 'Sale items', 'Finance', $m('Finance\\SaleItem'), 'The lines of each sale.', self::MONEY],
            // Workforce
            ['site_hours', 'Opening hours', 'Workforce', $m('Workforce\\SiteHour'), 'Opening hours of each site.', $setup],
            ['site_hour_exceptions', 'Opening hour exceptions', 'Workforce', $m('Workforce\\SiteHourException'), 'Days with different hours.', $setup],
            ['site_settings', 'Site settings', 'Workforce', $m('Workforce\\SiteSetting'), 'Per-site work settings.', $setup],
            ['staffing_rules', 'Staffing rules', 'Workforce', $m('Workforce\\StaffingRule'), 'How many people each site needs.', $setup],
            ['public_holidays', 'Public holidays', 'Workforce', $m('Workforce\\PublicHoliday'), 'Public holidays.', $setup],
            ['overtime_settings', 'Overtime settings', 'Workforce', $m('Workforce\\OvertimeSetting'), 'Overtime rates.', $setup],
            ['shifts', 'Shifts (rota)', 'Workforce', $m('Workforce\\Shift'), 'Who works when.', 'Export only: the rota is changed on the Rota screen'],
            ['shift_swaps', 'Shift swaps', 'Workforce', $m('Workforce\\ShiftSwap'), 'Swaps between people.', self::FLOW],
            ['leave_requests', 'Leave requests', 'Workforce', $m('Workforce\\LeaveRequest'), 'Leave asked for and its decision.', self::FLOW],
            ['time_entries', 'Clock-ins', 'Workforce', $m('Workforce\\TimeEntry'), 'Clock-in and clock-out records.', self::LEDGER],
            ['time_breaks', 'Breaks', 'Workforce', $m('Workforce\\TimeBreak'), 'Breaks taken during a shift.', self::LEDGER],
            ['overtime_approvals', 'Overtime approvals', 'Workforce', $m('Workforce\\OvertimeApproval'), 'Overtime and who approved it.', self::MONEY],
            ['site_days', 'Opening and closing days', 'Workforce', $m('Workforce\\SiteDay'), 'When each site opened and closed.', self::LEDGER],
            ['custody_keys', 'Keys', 'Workforce', $m('Workforce\\CustodyKey'), 'The shop keys.', $setup],
            ['key_handovers', 'Key hand-overs', 'Workforce', $m('Workforce\\KeyHandover'), 'Who held which key.', self::LEDGER],
            ['staff_rides', 'Staff rides', 'Workforce', $m('Workforce\\StaffRide'), 'Rides taken to and from work.', self::FLOW],
            // Calendar
            ['calendar_events', 'Calendar events', 'Calendar', $m('Calendar\\CalendarEvent'), 'Events and reminders.', $setup],
            // People
            ['customers', 'Customers', 'People', $m('Auth\\Customer'), 'The customers sellers and admins keep.', $setup],
            ['customer_addresses', 'Customer addresses', 'People', $m('Auth\\CustomerAddress'), 'Addresses of customers.', $setup],
            ['users', 'Staff accounts', 'People', $m('Auth\\User'), 'Staff, their role and store (never passwords).', 'Export only: roles and stores are changed on the Users screen'],
        ];
    }
}
