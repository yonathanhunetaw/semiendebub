<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Inventory\StockLocation;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The names the catalogue tidy-up speaks in, shared by `catalogue:export` (which writes them
 * for the AI) and `catalogue:apply` (which reads the AI's answers back), so both mean the
 * same stores and places by the same words.
 */
final class CatalogueSheet
{
    /**
     * The real stores, id => name. Stores the walkthroughs add on dev ("Demo Store 123456")
     * are not part of the business.
     *
     * @return Collection<int, object{id: int, name: string}>
     */
    public function stores(): Collection
    {
        return DB::table('stores')->orderBy('id')->get(['id', 'name'])
            ->reject(fn (object $store): bool => str_starts_with((string) $store->name, 'Demo '))
            ->keyBy('id');
    }

    /**
     * The places that can hold stock, id => readable unique name. The "In Delivery" transit
     * place and the store nodes are not places an item lives, so they are left out.
     *
     * @return array<int, array{name: string, kind: string, store: string}>
     */
    public function locations(?Collection $stores = null): array
    {
        $stores ??= $this->stores();
        $out = [];
        $kinds = [StockLocation::KIND_MAIN_HUB, StockLocation::KIND_REMOTE_HUB, StockLocation::KIND_BACKROOM, StockLocation::KIND_SHELF];

        foreach (StockLocation::query()->whereIn('kind', $kinds)->orderBy('id')->get() as $location) {
            $store = $location->store_id === null ? null : ($stores[$location->store_id]->name ?? false);
            if ($store === false) {
                continue; // a demo store's place
            }
            $name = match ($location->kind) {
                StockLocation::KIND_BACKROOM => "{$store} · Store Floor",
                StockLocation::KIND_SHELF => "{$store} · Store Shelf",
                StockLocation::KIND_REMOTE_HUB => "{$location->name} ({$store})",
                default => (string) $location->name,
            };
            $out[(int) $location->id] = ['name' => $name, 'kind' => (string) $location->kind, 'store' => (string) ($store ?? '')];
        }

        return $out;
    }
}
