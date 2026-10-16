<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Purchase;
use App\Models\StockKeeper\ItemStock;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Supplier-facing read model.
 *
 * A vendor is a User with role `vendor`. Two things tie the business to them:
 *   - `item_variants.owner_id` — the SKUs they supply
 *   - `purchases.vendor_id`    — the orders placed with them
 */
class VendorService
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_RECEIVED = 'received';

    /** The vendor app's spelling; the order itself says `cancelled`. */
    public const STATUS_CANCELED = 'canceled';

    /**
     * The vendor app's three buckets over the purchase order workflow. Drafts
     * and orders still waiting for approval are internal: a vendor never
     * sees them.
     */
    public const BUCKETS = [
        self::STATUS_PENDING => Purchase::OPEN,
        self::STATUS_RECEIVED => [Purchase::STATUS_RECEIVED, Purchase::STATUS_CLOSED],
        self::STATUS_CANCELED => [Purchase::STATUS_CANCELLED],
    ];

    /**
     * Headline counters for the vendor dashboard.
     *
     * @return array<string, int|float>
     */
    public function metrics(User $vendor): array
    {
        $orders = fn (): Builder => $this->visibleOrders($vendor);

        $variantIds = $this->variantIds($vendor);

        return [
            'catalogue_skus' => $variantIds->count(),
            'units_in_network' => (int) ItemStock::query()
                ->whereIn('item_variant_id', $variantIds)
                ->sum('quantity'),
            'orders_total' => (int) $orders()->count(),
            'orders_pending' => (int) $orders()->whereIn('status', self::BUCKETS[self::STATUS_PENDING])->count(),
            'orders_received' => (int) $orders()->whereIn('status', self::BUCKETS[self::STATUS_RECEIVED])->count(),
            'orders_canceled' => (int) $orders()->whereIn('status', self::BUCKETS[self::STATUS_CANCELED])->count(),
            'revenue_received' => (float) $orders()
                ->whereIn('status', self::BUCKETS[self::STATUS_RECEIVED])
                ->sum('total_amount'),
            'revenue_pending' => (float) $orders()
                ->whereIn('status', self::BUCKETS[self::STATUS_PENDING])
                ->sum('total_amount'),
        ];
    }

    /**
     * The SKUs this vendor supplies.
     *
     * @return LengthAwarePaginator<int, ItemVariant>
     */
    public function paginateCatalogue(
        User $vendor,
        ?string $search = null,
        ?int $perPage = null
    ): LengthAwarePaginator {
        $query = ItemVariant::query()
            ->where('owner_id', $vendor->id)
            ->with(['item.category', 'itemColor', 'itemSize', 'itemPackagingType']);

        if ($search !== null && $search !== '') {
            $term = '%' . $search . '%';
            $query->where(fn (Builder $q) => $q
                ->where('sku', 'LIKE', $term)
                ->orWhere('barcode', 'LIKE', $term)
                ->orWhereHas('item', fn (Builder $iq) => $iq->where('product_name', 'LIKE', $term)));
        }

        return $query->orderByDesc('id')->paginate($perPage ?? 25)->withQueryString();
    }

    /**
     * Orders placed with this vendor.
     *
     * @return LengthAwarePaginator<int, Purchase>
     */
    public function paginateOrders(
        User $vendor,
        ?string $status = null,
        ?string $search = null,
        ?int $perPage = null
    ): LengthAwarePaginator {
        $query = $this->visibleOrders($vendor)
            ->with(['store', 'warehouse', 'user']);

        if ($status !== null && isset(self::BUCKETS[$status])) {
            $query->whereIn('status', self::BUCKETS[$status]);
        }

        if ($search !== null && $search !== '') {
            $term = '%' . $search . '%';
            $query->where(fn (Builder $q) => $q
                ->where('reference_number', 'LIKE', $term)
                ->orWhere('notes', 'LIKE', $term));
        }

        return $query->orderByDesc('id')->paginate($perPage ?? 25)->withQueryString();
    }

    /**
     * @return array<string, int>
     */
    public function orderStatusCounts(User $vendor): array
    {
        $counts = $this->visibleOrders($vendor)
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        $bucket = fn (string $name): int => (int) $counts->only(self::BUCKETS[$name])->sum();

        return [
            'all' => (int) $counts->sum(),
            self::STATUS_PENDING => $bucket(self::STATUS_PENDING),
            self::STATUS_RECEIVED => $bucket(self::STATUS_RECEIVED),
            self::STATUS_CANCELED => $bucket(self::STATUS_CANCELED),
        ];
    }

    /**
     * Shape one supplied SKU, including how many units sit in the network.
     *
     * @param  array<int, int>  $stockByVariant
     * @return array<string, mixed>
     */
    public function presentVariant(ItemVariant $variant, array $stockByVariant = []): array
    {
        return [
            'id' => (int) $variant->id,
            'sku' => $variant->sku,
            'barcode' => $variant->barcode,
            'product_name' => (string) ($variant->item?->product_name ?? 'Unknown product'),
            'category' => $variant->item?->category?->category_name,
            'color' => $variant->itemColor?->name,
            'size' => $variant->itemSize?->name,
            'packaging' => $variant->itemPackagingType?->name,
            'pieces_per_unit' => $variant->calculateTotalPieces(),
            'image_url' => $variant->image_url,
            'status' => $variant->status,
            'units_in_network' => (int) ($stockByVariant[$variant->id] ?? 0),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function presentOrder(Purchase $purchase): array
    {
        return [
            'id' => (int) $purchase->id,
            'reference_number' => (string) $purchase->reference_number,
            'status' => self::bucketOf((string) $purchase->status),
            'total_amount' => (float) $purchase->total_amount,
            'store' => $purchase->store?->name,
            'warehouse' => $purchase->warehouse?->name,
            'raised_by' => trim((string) ($purchase->user?->first_name . ' ' . $purchase->user?->last_name)) ?: null,
            'notes' => $purchase->notes,
            'purchased_at' => $purchase->purchased_at?->toIso8601String(),
            'expected_at' => $purchase->expected_at?->toIso8601String(),
            'created_at' => $purchase->created_at?->toIso8601String(),
        ];
    }

    /**
     * Units on hand across the network for a set of variants, keyed by variant.
     *
     * @param  array<int, int>  $variantIds
     * @return array<int, int>
     */
    public function stockForVariants(array $variantIds): array
    {
        if ($variantIds === []) {
            return [];
        }

        return ItemStock::query()
            ->selectRaw('item_variant_id, SUM(quantity) as units')
            ->whereIn('item_variant_id', $variantIds)
            ->groupBy('item_variant_id')
            ->pluck('units', 'item_variant_id')
            ->map(fn ($units) => (int) $units)
            ->all();
    }

    /** The vendor app's bucket for an order status. */
    public static function bucketOf(string $status): string
    {
        foreach (self::BUCKETS as $bucket => $statuses) {
            if (in_array($status, $statuses, true)) {
                return $bucket;
            }
        }

        return self::STATUS_PENDING;
    }

    /** This vendor's orders, from the moment they were approved. */
    public function visibleOrders(User $vendor): Builder
    {
        return Purchase::query()
            ->forVendor((int) $vendor->id)
            ->whereIn('status', array_merge(...array_values(self::BUCKETS)));
    }

    /**
     * @return \Illuminate\Support\Collection<int, int>
     */
    private function variantIds(User $vendor)
    {
        return ItemVariant::query()
            ->where('owner_id', $vendor->id)
            ->pluck('id');
    }
}
