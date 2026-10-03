<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment\Concerns;

use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Services\Inventory\StockScope;

/**
 * A shipment end named either way: a location from the tree
 * (`*_location_id` — how Hubs A and B, which are not stores, are picked), or a
 * facility (`*_store_id`, the older form). Both resolve to the leaf the stock
 * actually moves at: a store's floor, a Remote Hub, a Main Hub.
 */
trait ResolvesShipmentEnds
{
    public function originLocation(): ?StockLocation
    {
        return $this->resolveEnd('origin');
    }

    public function destinationLocation(): ?StockLocation
    {
        return $this->resolveEnd('destination');
    }

    private function resolveEnd(string $end): ?StockLocation
    {
        $scope = app(StockScope::class);

        if ($this->filled("{$end}_location_id")) {
            return $scope->leafFor(StockLocation::class, $this->integer("{$end}_location_id"));
        }

        if ($this->filled("{$end}_store_id")) {
            return $scope->leafFor(Store::class, $this->integer("{$end}_store_id"));
        }

        return null;
    }

    /** The store an end belongs to (a shared hub has none). */
    public static function storeIdOf(StockLocation $location): ?int
    {
        if ($location->legacy_type === Store::class && $location->legacy_id !== null) {
            return (int) $location->legacy_id;
        }

        return $location->store_id !== null ? (int) $location->store_id : null;
    }
}
