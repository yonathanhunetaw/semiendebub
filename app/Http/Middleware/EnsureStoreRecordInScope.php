<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\Admin\ActiveStore;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * A store's own pages (its inventory, prices, replenishment, transfers) are
 * open to a store admin, but only for their stores. This works out which store
 * the route's record belongs to and 404s when it is not one of theirs. A
 * global admin passes untouched.
 */
class EnsureStoreRecordInScope
{
    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    /**
     * @param  Closure(Request): (Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        // A store's own page makes that store the active one.
        $store = $request->route()?->parameter('store');
        if ($store !== null) {
            $this->activeStore->select((int) ($store instanceof Store ? $store->id : $store), $request);
        }

        if ($this->activeStore->isGlobal()) {
            return $next($request);
        }

        $storeIds = $this->storeIdsFor($request);

        abort_if($storeIds === [], 404);
        abort_unless(collect($storeIds)->contains(fn (?int $id): bool => $this->activeStore->allows($id)), 404);

        return $next($request);
    }

    /**
     * The store(s) the route's record belongs to; a transfer has two ends.
     *
     * @return array<int, int|null>
     */
    private function storeIdsFor(Request $request): array
    {
        $route = $request->route();

        if (($store = $route->parameter('store')) !== null) {
            return [(int) ($store instanceof Store ? $store->id : $store)];
        }

        if (($variant = $route->parameter('storeVariant')) !== null) {
            $variant = $variant instanceof StoreVariant ? $variant : StoreVariant::query()->find($variant);

            return [$variant?->store_id !== null ? (int) $variant->store_id : null];
        }

        if (($transfer = $route->parameter('transfer')) !== null) {
            $transfer = $transfer instanceof Transfer ? $transfer : Transfer::query()->find($transfer);

            return $transfer === null ? [] : [
                $transfer->from_store_id !== null ? (int) $transfer->from_store_id : null,
                $transfer->to_store_id !== null ? (int) $transfer->to_store_id : null,
            ];
        }

        // Price records: `{price}` on the delete routes, `{source}/{id}` on
        // the override routes.
        $price = $route->parameter('price');
        $source = $route->parameter('source');
        $id = $route->parameter('id');

        $record = match (true) {
            $price instanceof StoreVariantCustomerPrice, $price instanceof StoreVariantSellerPrice => $price,
            $price !== null && str_contains($route->getName() ?? '', 'customer-price') => StoreVariantCustomerPrice::query()->find($price),
            $price !== null && str_contains($route->getName() ?? '', 'seller-price') => StoreVariantSellerPrice::query()->find($price),
            $source === 'b2b' => StoreVariant::query()->find($id),
            $source === 'individual' => StoreVariantIndividualPrice::query()->find($id),
            $source === 'customer' => StoreVariantCustomerPrice::query()->find($id),
            $source === 'seller' => StoreVariantSellerPrice::query()->find($id),
            default => null,
        };

        if ($record instanceof StoreVariant) {
            return [$record->store_id !== null ? (int) $record->store_id : null];
        }

        if ($record !== null) {
            $storeId = StoreVariant::query()->whereKey($record->store_variant_id)->value('store_id');

            return [$storeId !== null ? (int) $storeId : null];
        }

        return [];
    }
}
