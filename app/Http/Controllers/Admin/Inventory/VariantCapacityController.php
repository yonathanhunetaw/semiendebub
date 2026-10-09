<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\UpdateVariantCapacityRequest;
use App\Models\Store\Store;
use App\Services\Admin\ActiveStore;
use App\Models\Store\StoreVariant;
use App\Services\Inventory\LocationCapacityService;
use App\Services\Inventory\ReplenishmentProposalService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Min/max capacity, set per variant and per level.
 *
 * One screen rather than one per level: the question a buyer actually asks is
 * "how much of this SKU should sit on the floor, in the back room, at the remote
 * unit and at the hub", and answering it in four places is how those four
 * numbers end up contradicting each other.
 *
 * Saving a band is what enrols a location in automated replenishment. Clearing
 * both numbers to zero withdraws it again.
 */
class VariantCapacityController extends Controller
{
    public function __construct(
        private readonly LocationCapacityService $capacity,
        private readonly ReplenishmentProposalService $planner,
    ) {
    }

    /**
     * Variants in a store, with how many of their levels are monitored and how
     * many are currently short.
     */
    public function index(Request $request, ActiveStore $activeStore): Response
    {
        // Capacity is set one facility at a time: this page's own pick when the
        // user may have it, else the active store, else their first retail one.
        $requested = $request->integer('store_id');
        $storeId = $requested !== 0 && $activeStore->allows($requested)
            ? $requested
            : ($activeStore->id() ?? (int) ($activeStore->accessibleStores()->firstWhere('type', Store::TYPE_RETAIL)?->id ?? 0));
        $search = trim((string) $request->string('search'));

        $store = $storeId !== 0 ? Store::find($storeId) : null;

        $variants = StoreVariant::query()
            ->where('store_id', $storeId)
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize', 'capacities'])
            ->when($search !== '', function ($query) use ($search): void {
                $query->whereHas('itemVariant', function ($inner) use ($search): void {
                    $inner->where('sku', 'like', "%{$search}%")
                        ->orWhereHas('item', fn ($item) => $item->where('product_name', 'like', "%{$search}%"));
                });
            })
            ->orderBy('id')
            ->paginate(20)
            ->withQueryString();

        return Inertia::render('Admin/Inventory/Capacity/index', [
            'store' => $store === null ? null : [
                'id' => (int) $store->id,
                'name' => (string) $store->name,
                'type_label' => $store->type_label,
            ],
            'stores' => $activeStore->accessibleStores()->map(fn (Store $facility): array => [
                'id' => (int) $facility->id,
                'name' => (string) $facility->name,
                'type_label' => $facility->type_label,
            ])->all(),
            'variants' => collect($variants->items())->map(function (StoreVariant $variant): array {
                $itemVariant = $variant->itemVariant;

                return [
                    'id' => (int) $variant->id,
                    'product_name' => (string) ($itemVariant?->item?->product_name ?? 'Unnamed product'),
                    'sku' => $itemVariant?->sku,
                    'variant_label' => collect([
                        $itemVariant?->itemColor?->name,
                        $itemVariant?->itemSize?->name,
                    ])->filter()->join(' / ') ?: 'Standard',
                    'monitored_levels' => $variant->capacities->where('min_capacity', '>', 0)->count(),
                    'levels_total' => $variant->capacities->count(),
                ];
            })->all(),
            'filters' => ['store_id' => $storeId, 'search' => $search],
            'pagination' => [
                'current_page' => $variants->currentPage(),
                'last_page' => $variants->lastPage(),
                'total' => $variants->total(),
            ],
        ]);
    }

    /**
     * One variant's bands, one row per level of the hierarchy.
     */
    public function edit(StoreVariant $storeVariant, ActiveStore $activeStore): Response
    {
        abort_unless($activeStore->allows((int) $storeVariant->store_id), 404);

        $storeVariant->loadMissing(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize', 'store']);

        $itemVariant = $storeVariant->itemVariant;

        return Inertia::render('Admin/Inventory/Capacity/Edit', [
            'variant' => [
                'id' => (int) $storeVariant->id,
                'product_name' => (string) ($itemVariant?->item?->product_name ?? 'Unnamed product'),
                'sku' => $itemVariant?->sku,
                'variant_label' => collect([
                    $itemVariant?->itemColor?->name,
                    $itemVariant?->itemSize?->name,
                ])->filter()->join(' / ') ?: 'Standard',
                'store_name' => (string) ($storeVariant->store?->name ?? 'Unknown store'),
            ],
            'bands' => $this->capacity->bandsFor($storeVariant),
            'can_edit' => $storeVariant->store !== null
                && (request()->user()?->can('manageCapacity', $storeVariant->store) ?? false),
        ]);
    }

    /**
     * Save every level in one post.
     *
     * Then sweep immediately: a floor raised above what the shelf currently
     * holds is a breach the moment it is saved, and waiting for the nightly job
     * to notice would make the screen look like it had done nothing.
     */
    public function update(UpdateVariantCapacityRequest $request, StoreVariant $storeVariant): RedirectResponse
    {
        abort_unless(app(ActiveStore::class)->allows((int) $storeVariant->store_id), 404);

        foreach ($request->bands() as $band) {
            $this->capacity->setBand(
                $storeVariant,
                $band['location_type'],
                $band['location_id'],
                $band['min_capacity'],
                $band['max_capacity'],
                $request->user()?->id,
            );
        }

        $outcome = $this->planner->sweep([(int) $storeVariant->id]);
        $proposed = count($outcome['created']);

        return back()->with(
            'success',
            $proposed === 0
                ? 'Capacity updated.'
                : sprintf('Capacity updated. %d replenishment proposal(s) raised for approval.', $proposed),
        );
    }
}
