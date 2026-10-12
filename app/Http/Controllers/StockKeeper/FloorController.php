<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Controllers\StockKeeper\Concerns\KeeperScope;
use App\Http\Requests\StockKeeper\PlaceItemRequest;
use App\Http\Requests\StockKeeper\SaveFloorAreaRequest;
use App\Http\Requests\StockKeeper\SetFloorSizeRequest;
use App\Models\Inventory\FloorArea;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Services\Inventory\FloorPlan;
use App\Services\Inventory\LocationLevels;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/** A hub's floor plan: size, areas, and which items sit where. */
class FloorController extends Controller
{
    use KeeperScope;

    public function __construct(private readonly FloorPlan $plan)
    {
    }

    public function index(Request $request): Response
    {
        $scope = $this->scopeIds($request->user());

        $locations = StockLocation::query()
            ->with('store:id,name')
            ->whereIn('kind', LocationLevels::KINDS)
            ->when($scope !== null, fn ($q) => $q->whereIn('id', $scope))
            ->orderByRaw("CASE kind WHEN 'main_hub' THEN 0 WHEN 'remote_hub' THEN 1 ELSE 2 END")
            ->orderBy('name')
            ->get();

        $selected = $locations->firstWhere('id', $request->integer('location')) ?? $locations->first();

        return Inertia::render('StockKeeper/Floor/index', [
            'locations' => $locations->map(fn (StockLocation $l): array => [
                'id' => (int) $l->id,
                'name' => (string) $l->name,
                'kind' => (string) $l->kind,
                'store' => $l->store?->name,
            ])->values()->all(),
            'plan' => $selected ? $this->plan->forLocation($selected) : null,
            'can_edit' => $selected ? $this->mayOperate($request->user(), $selected) : false,
            'focus' => $request->integer('item') ?: null,
        ]);
    }

    public function size(SetFloorSizeRequest $request, StockLocation $location): RedirectResponse
    {
        $this->authorizeLocation($request->user(), $location);

        return $this->attempt(fn () => $this->plan->setSize($location, (float) $request->input('width'), (float) $request->input('length')), 'Floor size saved.');
    }

    public function storeArea(SaveFloorAreaRequest $request, StockLocation $location): RedirectResponse
    {
        $this->authorizeLocation($request->user(), $location);

        return $this->attempt(fn () => $this->plan->saveArea($location, $request->validated()), 'Area added.');
    }

    public function updateArea(SaveFloorAreaRequest $request, StockLocation $location, FloorArea $area): RedirectResponse
    {
        $this->authorizeArea($request, $location, $area);

        return $this->attempt(fn () => $this->plan->saveArea($location, $request->validated(), $area), "Area {$area->code} saved.");
    }

    public function destroyArea(Request $request, StockLocation $location, FloorArea $area): RedirectResponse
    {
        $this->authorizeArea($request, $location, $area);
        $area->delete();

        return back()->with('success', "Area {$area->code} removed; its items are now unplaced.");
    }

    public function place(PlaceItemRequest $request, StockLocation $location, FloorArea $area): RedirectResponse
    {
        $this->authorizeArea($request, $location, $area);
        $item = Item::query()->findOrFail($request->integer('item_id'));
        $this->plan->place($area, $item, $request->user());

        return back()->with('success', "{$item->product_name} placed in {$area->code}.");
    }

    public function unplace(Request $request, StockLocation $location, FloorArea $area, Item $item): RedirectResponse
    {
        $this->authorizeArea($request, $location, $area);
        $this->plan->unplace($area, $item);

        return back()->with('success', "{$item->product_name} taken out of {$area->code}.");
    }

    private function authorizeArea(Request $request, StockLocation $location, FloorArea $area): void
    {
        abort_unless((int) $area->stock_location_id === (int) $location->id, 404);
        $this->authorizeLocation($request->user(), $location);
    }

    private function attempt(callable $action, string $success): RedirectResponse
    {
        try {
            $action();
        } catch (InvalidArgumentException $e) {
            return back()->withErrors(['floor' => $e->getMessage()]);
        }

        return back()->with('success', $success);
    }
}
