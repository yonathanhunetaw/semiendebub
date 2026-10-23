<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Services\Calendar\CalendarFeed;
use App\Services\Calendar\CalendarScope;
use App\Services\Workforce\LocalTime;

/**
 * The desks that are a module's overview rather than a queue of work: the
 * counter (carts and orders to pay), customers, the catalogue, the stores,
 * hubs and fleet, the stock keeper's levels and alerts, and the calendar. A
 * few facts about each, what is on today, and a link to the module's own page
 * for what a desk cannot do (a cart, an item's setup, a store's form).
 */
class OverviewStations
{
    use BuildsStations;

    public function __construct(private readonly CalendarFeed $calendar)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        return array_values(array_filter([
            $this->counter($viewer, $storeId),
            $this->customers($storeId),
            $this->catalogue(),
            $this->stockPages(),
            $this->network($viewer),
            $this->office($viewer),
        ]));
    }

    /** @param  array<string, string>  $pages  label => route name */
    private function links(array $pages): array
    {
        return array_values(array_filter(array_map(fn (string $label, string $route): ?array => $this->open($label, $route), array_keys($pages), array_values($pages))));
    }

    private function counter(User $viewer, int $storeId): ?array
    {
        if (! in_array($this->app, ['seller', 'admin'], true)) {
            return null;
        }

        $carts = Cart::query()->where('store_id', $storeId)->where('status', 'open')->count();
        $toPay = Sale::query()->forStore($storeId)->where('fulfillment_stage', Sale::STAGE_AWAITING_PAYMENT)->count();
        $pick = Sale::query()->forStore($storeId)->awaitingSourcing()->count();

        return $this->station('counter', 'Counter', 'desk_counter', [], [
            'blurb' => 'Sales happen here: the seller builds the cart with the customer and checks out; payment is confirmed by a second person.',
            'stats' => [['label' => 'open carts', 'value' => $carts], ['label' => 'orders to pay', 'value' => $toPay], ['label' => 'to pick & pack', 'value' => $pick]],
            'links' => $this->links($this->app === 'seller'
                ? ['Open carts' => 'seller.carts.index', 'Orders' => 'seller.orders.index', 'Balance' => 'seller.balance.index']
                : ['Carts' => 'admin.carts.index', 'Orders' => 'admin.orders.index']),
        ]);
    }

    private function customers(int $storeId): ?array
    {
        if (! in_array($this->app, ['seller', 'admin'], true)) {
            return null;
        }

        return $this->station('customers', 'Customers & credit', 'desk_customers', [], [
            'blurb' => 'The customers the shop knows: their prices, their credit, and repayments.',
            'stats' => [['label' => 'customers', 'value' => Customer::query()->count()]],
            'links' => $this->links($this->app === 'seller' ? ['Customers' => 'seller.customers.index'] : ['Customers' => 'admin.customers.index', 'Credit' => 'admin.credit.index']),
        ]);
    }

    private function catalogue(): ?array
    {
        if ($this->app !== 'admin') {
            return null;
        }

        return $this->station('catalogue', 'Catalogue', 'desk_catalogue', [], [
            'blurb' => 'Every item the business sells: its variants, barcodes, prices per store and where it is stocked.',
            'stats' => [['label' => 'items', 'value' => Item::query()->count()], ['label' => 'active', 'value' => Item::query()->where('status', 'active')->count()]],
            'links' => $this->links(['Items' => 'admin.items.index', 'Stock' => 'inventory.index']),
        ]);
    }

    /** The stock keeper's levels, alerts, floor plan, inventory and barcode scan. */
    private function stockPages(): ?array
    {
        if ($this->app !== 'stock_keeper') {
            return null;
        }

        return $this->station('stock_pages', 'Levels, alerts & floor', 'desk_counts', [], [
            'blurb' => 'The shelf bins and their refill lines, what is running low, the floor plan, and the whole inventory.',
            'links' => $this->links(['Levels' => 'stock_keeper.levels.index', 'Stock alerts' => 'stock_keeper.alerts.index', 'Floor plan' => 'stock_keeper.floor.index', 'Inventory' => 'stock_keeper.inventory.index', 'Scan' => 'stock_keeper.scan']),
        ]);
    }

    private function network(User $viewer): ?array
    {
        if ($this->app !== 'admin') {
            return null;
        }

        return $this->station('network', 'Stores, hubs & fleet', 'desk_sites', [], [
            'blurb' => 'The places stock lives in and the vehicles that carry it.',
            'stats' => [
                ['label' => 'stores', 'value' => Store::query()->count()],
                ['label' => 'main hubs', 'value' => StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->count()],
                ['label' => 'vehicles', 'value' => Vehicle::query()->count()],
            ],
            'links' => $this->links(['All stores' => 'admin.inventory.stores', 'Warehouses' => 'admin.inventory.warehouse.index', 'Fleet' => 'admin.inventory.fleet.index', 'Sites & keys' => 'admin.work.sites.index']),
        ]);
    }

    /** Today's calendar, and the pages that run the office. */
    private function office(User $viewer): ?array
    {
        $route = "{$this->app}.calendar";
        $today = LocalTime::today();
        $items = [];

        if ($this->url($route) !== null) {
            try {
                $events = $this->calendar->between(CalendarScope::for($this->app, $viewer), $today->utc(), $today->addDay()->utc());
            } catch (\Throwable) {
                $events = [];
            }

            foreach (array_slice($events, 0, 8) as $event) {
                $items[] = [
                    'id' => 'cal-'.md5((string) ($event['id'] ?? '')),
                    'title' => (string) ($event['title'] ?? 'Event'),
                    'subtitle' => trim(($event['subtitle'] ?? '').' '.(($event['state'] ?? '') === 'late' ? '· late' : '')),
                    'chips' => array_values(array_filter([['label' => (string) ($event['source'] ?? 'calendar'), 'tone' => ($event['state'] ?? '') === 'late' ? 'warning' : 'info']])),
                    'actions' => [],
                ];
            }
        }

        $pages = ['Calendar' => $route];
        if ($this->app === 'admin') {
            $pages += ['White board' => 'admin.canvas.index', 'Sessions' => 'admin.sessions.index', 'Users' => 'admin.users.index', 'Settings' => 'admin.settings', 'System' => 'admin.system.index'];
        } elseif ($this->app === 'delivery') {
            $pages += ['Profile' => 'delivery.profile.index'];
        }

        return $this->station('office', 'Calendar & office', 'desk_office', $items, [
            'blurb' => "Today on the calendar: deliveries, bills, shifts, shipments. The pages that run the office are linked below.",
            'empty' => 'Nothing on the calendar today.',
            'info' => true,
            'links' => $this->links($pages),
        ]);
    }
}
