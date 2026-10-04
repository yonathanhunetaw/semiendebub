<?php

namespace App\Providers;

use App\Models\Inventory\Warehouse;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Observers\ItemStockObserver;
use App\Policies\Inventory\WarehousePolicy;
use App\Policies\StockKeeper\TransferPolicy;
use App\Policies\Store\StorePolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use Illuminate\Support\Facades\URL;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        if (app()->environment('production')) {
            URL::forceScheme('https');
        }
        Vite::prefetch(concurrency: 3);

        $this->registerPolicies();
        $this->registerObservers();

        \Illuminate\Support\Facades\Session::extend('database', function ($app) {
            $table = config('session.table');
            $lifetime = config('session.lifetime');
            $connection = $app['db']->connection(config('session.connection'));

            return new \App\Extensions\CustomDatabaseSessionHandler(
                $connection, $table, $lifetime, $app
            );
        });
    }

    /**
     * Policies are registered explicitly because models are namespaced by
     * domain (App\Models\Inventory\Warehouse), which Laravel's convention-based
     * policy discovery (App\Models\X → App\Policies\XPolicy) cannot resolve.
     */
    private function registerPolicies(): void
    {
        Gate::policy(Warehouse::class, WarehousePolicy::class);
        Gate::policy(Store::class, StorePolicy::class);
        Gate::policy(Transfer::class, TransferPolicy::class);
    }

    /**
     * Watch the positional stock ledger so a location falling through its
     * minimum capacity raises a replenishment proposal immediately.
     *
     * Both ItemStock models are observed: they are two classes over the one
     * `item_stocks` table (StockKeeper's is used by the shipment and transfer
     * services, Inventory's by the warehouse screens), and a movement must be
     * noticed whichever one wrote it.
     *
     * @see \App\Observers\ItemStockObserver
     */
    private function registerObservers(): void
    {
        \App\Models\StockKeeper\ItemStock::observe(ItemStockObserver::class);
        \App\Models\Inventory\ItemStock::observe(ItemStockObserver::class);

        // Shelf bins at their refill line raise a refill; legs follow the
        // transfer or shipment carrying them.
        \App\Models\StockKeeper\ItemStock::observe(\App\Observers\ShelfRefillObserver::class);
        \App\Models\Inventory\ItemStock::observe(\App\Observers\ShelfRefillObserver::class);
        \App\Models\StockKeeper\Transfer::observe(\App\Observers\RefillCarrierObserver::class);
        \App\Models\Fulfillment\Shipment::observe(\App\Observers\RefillCarrierObserver::class);
        \App\Models\Fulfillment\ShipmentItem::observe(\App\Observers\RefillCarrierObserver::class);
    }
}
