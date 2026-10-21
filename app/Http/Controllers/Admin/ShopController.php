<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\SaveShopRequest;
use App\Http\Requests\Procurement\SetShopModeRequest;
use App\Models\Procurement\Shop;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StockPermissions;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The other shops in the market, where sellers check prices. Any admin keeps
 * the directory; each store's admin marks, for their store, which shops to
 * check and which to avoid. Only "check" shops are offered on a price check.
 */
class ShopController extends Controller
{
    public function __construct(
        private readonly ActiveStore $activeStore,
        private readonly StockPermissions $permissions,
    ) {
    }

    public function index(Request $request): Response
    {
        $search = trim((string) $request->string('search'));
        $storeId = $this->activeStore->id();

        $shops = Shop::query()
            ->when($search !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->where('name', 'like', "%{$search}%")->orWhere('area', 'like', "%{$search}%")))
            ->with(['stores' => fn ($q) => $q->select('stores.id', 'stores.name')])
            ->orderByDesc('is_active')->orderBy('name')
            ->limit(300)
            ->get();

        return Inertia::render('Admin/Shops/Index', [
            'shops' => $shops->map(fn (Shop $shop): array => [
                'id' => (int) $shop->id,
                'name' => (string) $shop->name,
                'area' => $shop->area,
                'phone' => $shop->phone,
                'notes' => $shop->notes,
                'is_active' => (bool) $shop->is_active,
                // For the store in the dropdown: check, avoid or none.
                'mode' => $storeId !== null ? ($shop->stores->firstWhere('id', $storeId)?->pivot?->mode ?? 'none') : null,
                'checked_by' => $shop->stores->filter(fn ($s) => $s->pivot->mode === Shop::CHECK)->pluck('name')->values()->all(),
            ])->values()->all(),
            'filters' => ['search' => $search],
            'storeId' => $storeId,
            'canSetMode' => $storeId !== null && $this->permissions->isAdminOf($request->user(), $storeId),
        ]);
    }

    public function store(SaveShopRequest $request): RedirectResponse
    {
        $shop = Shop::query()->create($request->validated() + ['created_by' => $request->user()->id]);

        // A store admin adding a shop means to check it.
        $storeId = $this->activeStore->id();
        if ($storeId !== null && $this->permissions->isAdminOf($request->user(), $storeId)) {
            $shop->stores()->syncWithoutDetaching([$storeId => ['mode' => Shop::CHECK]]);
        }

        return back()->with('success', "{$shop->name} added.");
    }

    public function update(SaveShopRequest $request, Shop $shop): RedirectResponse
    {
        $shop->update($request->validated());

        return back()->with('success', "{$shop->name} saved.");
    }

    public function mode(SetShopModeRequest $request, Shop $shop): RedirectResponse
    {
        $storeId = (int) $request->validated('store_id');
        abort_unless($this->permissions->isAdminOf($request->user(), $storeId), 403, 'That store is not yours to set.');

        $mode = (string) $request->validated('mode');

        if ($mode === 'none') {
            $shop->stores()->detach($storeId);
        } else {
            $shop->stores()->syncWithoutDetaching([$storeId => ['mode' => $mode]]);
        }

        return back()->with('success', match ($mode) {
            Shop::CHECK => "Sellers will check {$shop->name}.",
            Shop::AVOID => "Sellers will avoid {$shop->name}.",
            default => "{$shop->name} is off this store's list.",
        });
    }
}
