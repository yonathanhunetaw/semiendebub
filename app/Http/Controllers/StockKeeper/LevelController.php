<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Requests\StockKeeper\SetCapacityRequest;
use App\Http\Requests\StockKeeper\SetLevelRequest;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Services\Inventory\LocationLevels;
use App\Services\Inventory\StockKeeperVisibility;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * Stock levels at the keeper's warehouses and store floors: what each item is
 * set to hold, its low-stock and crit-low lines, and the location's volume.
 */
class LevelController extends Controller
{
    public function __construct(
        private readonly LocationLevels $levels,
        private readonly StockKeeperVisibility $visibility,
    ) {
    }

    public function index(Request $request): Response
    {
        $scope = $this->scopeIds($request);

        $locations = StockLocation::query()
            ->with('store:id,name')
            ->whereIn('kind', LocationLevels::KINDS)
            ->when($scope !== null, fn ($q) => $q->whereIn('id', $scope))
            ->orderByRaw("CASE kind WHEN 'main_hub' THEN 0 WHEN 'remote_hub' THEN 1 ELSE 2 END")
            ->orderBy('name')
            ->get();

        $selected = $locations->firstWhere('id', $request->integer('location')) ?? $locations->first();

        return Inertia::render('StockKeeper/Levels/index', [
            'locations' => $locations->map(fn (StockLocation $l): array => [
                'id' => (int) $l->id,
                'name' => (string) $l->name,
                'kind' => (string) $l->kind,
                'store' => $l->store?->name,
            ])->values()->all(),
            'board' => $selected ? $this->levels->forLocation($selected) : null,
            'can_edit' => $selected ? $this->levels->canEdit($request->user(), $selected, $scope) : false,
        ]);
    }

    public function update(SetLevelRequest $request, StockLocation $location, Item $item): RedirectResponse
    {
        $this->authorizeEdit($request, $location);

        try {
            $this->levels->setLevel(
                $location,
                $item,
                $request->filled('item_packaging_type_id') ? $request->integer('item_packaging_type_id') : null,
                $request->integer('max'),
                $request->integer('low'),
                $request->integer('critical'),
                $request->user(),
            );
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['max' => $e->getMessage()]);
        }

        return back()->with('success', "Levels saved for {$item->product_name}.");
    }

    public function destroy(Request $request, StockLocation $location, Item $item): RedirectResponse
    {
        $this->authorizeEdit($request, $location);
        $this->levels->removeLevel($location, $item);

        return back()->with('success', "Levels cleared for {$item->product_name}.");
    }

    public function capacity(SetCapacityRequest $request, StockLocation $location): RedirectResponse
    {
        $this->authorizeEdit($request, $location);

        $this->levels->setCapacity(
            $location,
            $request->filled('capacity_cbm') ? (float) $request->input('capacity_cbm') : null,
        );

        return back()->with('success', "Capacity saved for {$location->name}.");
    }

    /** @return array<int, int>|null null = the keeper covers every dock */
    private function scopeIds(Request $request): ?array
    {
        $nodes = $this->visibility->scopeFor($request->user())['nodes'] ?? null;

        return $nodes === null ? null : array_map('intval', $nodes);
    }

    private function authorizeEdit(Request $request, StockLocation $location): void
    {
        abort_unless($this->levels->canEdit($request->user(), $location, $this->scopeIds($request)), 403);
    }
}
