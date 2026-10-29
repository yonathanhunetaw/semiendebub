<?php

declare(strict_types=1);

namespace App\Services\Vendor;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\StockPermissions;
use App\Services\Workforce\LocalTime;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;

/**
 * The vendor app's view of one store (a vendor is a store, docs/plans
 * missing-areas-prompt.md §6): its figures, the items it lists, its orders.
 * Read-only; running the store (prices, stock, staff) stays in the admin app,
 * where the owner is that store's admin.
 */
class VendorStore
{
    public function __construct(private readonly StockPermissions $permissions)
    {
    }

    /**
     * The store this person looks at: the one they own. A global admin may
     * look at any store that has an owner (`?store=` id), by default the first.
     */
    public function storeFor(User $user, ?int $asked = null): ?Store
    {
        if ($this->permissions->isGlobalAdmin($user)) {
            $vendors = Store::query()->whereNotNull('owner_id')->orderBy('name');

            return ($asked !== null ? (clone $vendors)->whereKey($asked)->first() : null) ?? $vendors->first();
        }

        return Store::query()->where('owner_id', $user->id)->first();
    }

    /** Stores a global admin can switch between here. @return array<int, array{id: int, name: string}> */
    public function choices(User $user): array
    {
        if (! $this->permissions->isGlobalAdmin($user)) {
            return [];
        }

        return Store::query()->whereNotNull('owner_id')->orderBy('name')->get(['id', 'name'])
            ->map(fn (Store $s): array => ['id' => (int) $s->id, 'name' => (string) $s->name])->all();
    }

    /** @return array<string, mixed> */
    public function profile(Store $store): array
    {
        return [
            'id' => (int) $store->id,
            'name' => (string) $store->name,
            'slug' => $store->slug,
            'description' => $store->description,
            'contact_phone' => $store->contact_phone,
            'contact_email' => $store->contact_email,
            'location' => $store->location,
            'status' => $store->status,
            'public_url' => $store->slug ? route('storefront.store', $store->slug) : null,
            'owner' => $store->owner ? trim($store->owner->first_name.' '.$store->owner->last_name) : null,
        ];
    }

    /** @return array<string, int|float> */
    public function metrics(Store $store): array
    {
        $since = LocalTime::startOf(LocalTime::today()->subDays(29));
        $sales = Sale::query()->where('store_id', $store->id);

        return [
            'listed_items' => StoreVariant::query()->where('store_id', $store->id)->where('active', true)->count(),
            'orders_30d' => (clone $sales)->where('created_at', '>=', $since)->count(),
            'revenue_30d' => round((float) (clone $sales)->where('created_at', '>=', $since)->where('payment_status', 'paid')->sum('total_amount'), 2),
            'to_pay' => (clone $sales)->where('fulfillment_stage', Sale::STAGE_AWAITING_PAYMENT)->count(),
            'to_pack' => (clone $sales)->where('fulfillment_stage', Sale::STAGE_PICK_PACK)->count(),
            'to_deliver' => (clone $sales)->where('fulfillment_stage', Sale::STAGE_TO_DELIVER)->count(),
        ];
    }

    public function orders(Store $store, ?string $stage = null, int $perPage = 20): LengthAwarePaginator
    {
        return Sale::query()
            ->where('store_id', $store->id)
            ->when($stage !== null && $stage !== '' && $stage !== 'all', fn ($q) => $q->where('fulfillment_stage', $stage))
            ->with('customer')
            ->withCount('items')
            ->orderByDesc('id')
            ->paginate($perPage)
            ->withQueryString()
            ->through(fn (Sale $sale): array => $this->presentOrder($sale));
    }

    /** @return array<string, mixed> */
    public function presentOrder(Sale $sale): array
    {
        return [
            'id' => (int) $sale->id,
            'reference' => (string) $sale->reference_number,
            'customer' => $sale->customer?->name ?? 'Walk-in',
            'total' => (float) $sale->total_amount,
            'payment_status' => (string) $sale->payment_status,
            'stage' => (string) $sale->fulfillment_stage,
            'stage_label' => Sale::fulfillmentStages()[(string) $sale->fulfillment_stage] ?? (string) $sale->fulfillment_stage,
            'lines' => (int) ($sale->items_count ?? 0),
            'placed_at' => $sale->created_at?->toIso8601String(),
        ];
    }

    /** @return array<string, mixed> */
    public function orderDetail(Sale $sale): array
    {
        $sale->loadMissing(['customer', 'items.storeVariant.item', 'items.storeVariant.itemVariant']);

        return $this->presentOrder($sale) + [
            'items' => $sale->items->map(fn ($line): array => [
                'id' => (int) $line->id,
                'item' => $line->storeVariant?->item?->product_name ?? 'Item',
                'sku' => $line->storeVariant?->itemVariant?->sku,
                'quantity' => (int) $line->quantity,
                'unit_price' => (float) $line->unit_price,
                'subtotal' => (float) $line->subtotal,
            ])->values()->all(),
        ];
    }

    public function catalogue(Store $store, ?string $search = null, int $perPage = 24): LengthAwarePaginator
    {
        return StoreVariant::query()
            ->where('store_id', $store->id)
            ->with(['item', 'itemVariant'])
            ->when($search, fn ($q) => $q->whereHas('item', fn ($i) => $i->where('product_name', 'like', '%'.$search.'%')))
            ->orderByDesc('active')
            ->orderBy('id')
            ->paginate($perPage)
            ->withQueryString()
            ->through(function (StoreVariant $sv): array {
                // The matrix is saved as {price…} or as [{price…}] (PriceProvider::normalizeMatrix).
                $matrix = is_array($sv->pricing_matrix) ? $sv->pricing_matrix : [];
                $base = isset($matrix['price']) ? $matrix : ($matrix[0] ?? []);

                return [
                    'id' => (int) $sv->id,
                    'item' => $sv->item?->product_name ?? 'Item',
                    'sku' => $sv->itemVariant?->sku,
                    'price' => isset($base['price']) && is_numeric($base['price']) ? (float) $base['price'] : null,
                    'active' => (bool) $sv->active,
                ];
            });
    }
}
