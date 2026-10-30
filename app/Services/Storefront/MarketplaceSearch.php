<?php

declare(strict_types=1);

namespace App\Services\Storefront;

use App\Models\Store\Store;
use App\Services\StorefrontCatalogService;
use Illuminate\Database\Eloquent\Collection;

/**
 * The marketplace across stores (a vendor is a store): every open store, and a
 * search that runs the shop's own item search in each of them, grouped by
 * store, so a result opens in the store that sells it (/s/{slug}).
 */
class MarketplaceSearch
{
    /** Results shown per store; its own page has the rest. */
    public const PER_STORE = 8;

    public function __construct(private readonly StorefrontCatalogService $catalog)
    {
    }

    /** @return Collection<int, Store> */
    public function openStores(): Collection
    {
        return Store::query()
            ->where('type', Store::TYPE_RETAIL)
            ->where('status', 'active')
            ->whereNotNull('slug')
            ->orderBy('name')
            ->get();
    }

    /** @return array<int, array<string, mixed>> one entry per open store, with how many items it lists */
    public function stores(): array
    {
        return $this->openStores()->map(fn (Store $store): array => $this->presentStore($store) + [
            'item_count' => $this->catalog->paginateItems($store, null, null, 1)->total(),
        ])->values()->all();
    }

    /**
     * The search in every open store; stores with no match are left out, the
     * store with the most matches comes first.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $query): array
    {
        $results = [];

        foreach ($this->openStores() as $store) {
            $page = $this->catalog->paginateItems($store, $query, null, self::PER_STORE);

            if ($page->total() === 0) {
                continue;
            }

            $results[] = $this->presentStore($store) + [
                'total' => $page->total(),
                'items' => collect($page->items())->map(fn ($item) => $this->catalog->presentItemCard($item, $store))->values()->all(),
            ];
        }

        usort($results, fn (array $a, array $b): int => $b['total'] <=> $a['total']);

        return $results;
    }

    /** @return array<string, mixed> */
    private function presentStore(Store $store): array
    {
        return [
            'id' => (int) $store->id,
            'name' => (string) $store->name,
            'slug' => (string) $store->slug,
            'description' => $store->description,
            'location' => $store->location,
            'url' => route('storefront.store', $store->slug),
        ];
    }
}
