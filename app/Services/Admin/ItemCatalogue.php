<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemVariant;
use App\Models\Store\StoreVariant;
use App\Services\ImageResolver;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Query\Builder as QueryBuilder;

/**
 * The admin item list (Admin/Items/Index), built to stay cheap however large
 * the catalogue grows: counts come from SQL (withCount / sub-selects) rather
 * than loading every variant, and each row eager-loads at most a handful of
 * variant images for its thumbnails.
 */
class ItemCatalogue
{
    /** Thumbnails shown per row. */
    private const PREVIEW_IMAGES = 4;

    /**
     * @param  array{q: string, status: string, category: int|null, needs_photos: bool, sort: string, direction: string, per_page: int}  $filters
     */
    public function page(array $filters): LengthAwarePaginator
    {
        $query = $this->filtered($filters)
            ->when($filters['status'] !== 'all', fn (Builder $q) => $q->where('items.status', $filters['status']))
            ->select('items.*')
            ->with([
                'category:id,category_name',
                // Only needed when an item has too few general images; a
                // per-parent limit keeps a 300-variant item from loading 300 rows.
                'variants' => fn (HasMany $q) => $q
                    ->select('id', 'item_id', 'images')
                    ->whereNotNull('images')
                    ->orderBy('id')
                    ->limit(self::PREVIEW_IMAGES),
            ])
            ->withCount([
                'variants',
                'variants as live_variants_count' => fn (Builder $q) => $q
                    ->where('status', 'active')
                    ->whereHas('storeVariants', fn (Builder $s) => $s->where('active', true)),
            ])
            ->addSelect(['stores_count' => $this->storesCountQuery()]);

        $column = match ($filters['sort']) {
            'updated' => 'items.updated_at',
            'created' => 'items.created_at',
            'variants' => 'variants_count',
            'live' => 'live_variants_count',
            default => 'items.product_name',
        };

        // The id tiebreak keeps rows from swapping between pages.
        $query->orderBy($column, $filters['direction'])->orderBy('items.id', $filters['direction']);

        $paginator = $query->paginate($filters['per_page'])->withQueryString();

        $paginator->setCollection($paginator->getCollection()->map(fn (Item $item): array => $this->row($item)));

        return $paginator;
    }

    /**
     * Items per status under the other filters, so each status tab shows what
     * clicking it would list. Includes `all` and `needs_photos`.
     *
     * @param  array{q: string, status: string, category: int|null, needs_photos: bool, sort: string, direction: string, per_page: int}  $filters
     * @return array<string, int>
     */
    public function counts(array $filters): array
    {
        $byStatus = $this->filtered($filters)
            ->toBase()
            ->selectRaw('items.status, count(*) as aggregate')
            ->groupBy('items.status')
            ->pluck('aggregate', 'status')
            ->map(fn ($n): int => (int) $n);

        $counts = ['all' => (int) $byStatus->sum()];

        foreach (['active', 'draft', 'inactive', 'archived'] as $status) {
            $counts[$status] = $byStatus->get($status, 0);
        }

        $counts['needs_photos'] = $this->filtered([...$filters, 'needs_photos' => true])
            ->when($filters['status'] !== 'all', fn (Builder $q) => $q->where('items.status', $filters['status']))
            ->count();

        return $counts;
    }

    /**
     * Categories for the filter, with how many items each holds directly.
     *
     * @return array<int, array{id: int, name: string, parent: string|null, items: int}>
     */
    public function categories(): array
    {
        // Not withCount('items'): that relation only counts active items.
        return ItemCategory::query()
            ->with('parent:id,category_name')
            ->select('id', 'category_name', 'parent_id')
            ->addSelect(['items_count' => Item::query()
                ->toBase()
                ->selectRaw('count(*)')
                ->whereColumn('items.item_category_id', 'item_categories.id')])
            ->orderBy('category_name')
            ->get()
            ->map(fn (ItemCategory $category): array => [
                'id' => $category->id,
                'name' => $category->category_name,
                'parent' => $category->parent?->category_name,
                'items' => (int) $category->items_count,
            ])
            ->all();
    }

    /**
     * Search, category and needs-photos; status is applied by the caller so
     * counts() can group across it.
     *
     * @param  array{q: string, category: int|null, needs_photos: bool}  $filters
     */
    private function filtered(array $filters): Builder
    {
        $query = Item::query();

        if ($filters['q'] !== '') {
            $term = $filters['q'];
            $like = '%' . addcslashes($term, '%_\\') . '%';

            $query->where(function (Builder $q) use ($term, $like): void {
                $q->where('items.product_name', 'like', $like)
                    ->orWhereHas('variants', fn (Builder $v) => $v
                        ->where('sku', 'like', $like)
                        ->orWhere('barcode', 'like', $like));

                if (ctype_digit($term)) {
                    $q->orWhere('items.id', (int) $term);
                }
            });
        }

        if ($filters['category'] !== null) {
            // A parent category also lists its subcategories' items.
            $ids = ItemCategory::query()
                ->where('id', $filters['category'])
                ->orWhere('parent_id', $filters['category'])
                ->pluck('id');

            $query->whereIn('items.item_category_id', $ids);
        }

        if ($filters['needs_photos']) {
            $query->where('items.is_incomplete', true);
        }

        return $query;
    }

    /** Distinct stores where at least one of the item's variants is listed and on. */
    private function storesCountQuery(): QueryBuilder
    {
        return StoreVariant::query()
            ->toBase()
            ->selectRaw('count(distinct store_variants.store_id)')
            ->join('item_variants', 'item_variants.id', '=', 'store_variants.item_variant_id')
            ->whereColumn('item_variants.item_id', 'items.id')
            ->whereNull('item_variants.deleted_at')
            ->where('store_variants.active', true);
    }

    /**
     * @return array{id: int, product_name: string, status: string, category: string|null, is_incomplete: bool, variants_count: int, live_variants_count: int, stores_count: int, images: array<int, string>, updated_at: string|null}
     */
    private function row(Item $item): array
    {
        $general = $item->general_images ?? [];

        if (is_string($general)) {
            $general = json_decode($general, true) ?? [];
        }

        $images = collect($general)
            ->merge($item->variants->map(fn (ItemVariant $v) => $v->images[0] ?? null))
            ->filter()
            ->unique()
            ->take(self::PREVIEW_IMAGES)
            ->map(fn (string $path): string => ImageResolver::resolve($path))
            ->values()
            ->all();

        return [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'status' => $item->status,
            'category' => $item->category?->category_name,
            'is_incomplete' => (bool) $item->is_incomplete,
            'variants_count' => (int) $item->variants_count,
            'live_variants_count' => (int) $item->live_variants_count,
            'stores_count' => (int) $item->stores_count,
            'images' => $images,
            'updated_at' => $item->updated_at?->toIso8601String(),
        ];
    }
}
