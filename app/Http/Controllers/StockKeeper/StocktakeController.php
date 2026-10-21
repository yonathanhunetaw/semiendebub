<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Exceptions\InsufficientStockException;
use App\Http\Controllers\Controller;
use App\Http\Controllers\StockKeeper\Concerns\KeeperScope;
use App\Http\Requests\StockKeeper\CountStocktakeLineRequest;
use App\Http\Requests\StockKeeper\StartStocktakeRequest;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Services\Inventory\ItemLookup;
use App\Services\Inventory\StocktakeService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/** Stocktakes: start a count, count lines (or scan), submit, approve. */
class StocktakeController extends Controller
{
    use KeeperScope;

    public function __construct(
        private readonly StocktakeService $stocktakes,
        private readonly ItemLookup $lookup,
    ) {
    }

    public function index(Request $request): Response
    {
        $scope = $this->scopeIds($request->user());

        $takes = Stocktake::query()
            ->with(['location', 'starter', 'submitter', 'approver'])
            ->withCount(['lines', 'lines as counted_count' => fn ($q) => $q->whereNotNull('counted')])
            ->when($scope !== null, fn ($q) => $q->whereIn('stock_location_id', $scope))
            ->latest()
            ->limit(50)
            ->get();

        $locations = StockLocation::query()
            ->with('store:id,name')
            ->where('is_stockable', true)
            ->whereNotIn('kind', StockLocation::OFF_NETWORK_KINDS)
            ->when($scope !== null, fn ($q) => $q->whereIn('id', $scope))
            ->orderBy('name')
            ->get();

        return Inertia::render('StockKeeper/Stocktakes/index', [
            'stocktakes' => $takes->map(fn (Stocktake $t): array => [
                'id' => (int) $t->id,
                'reference' => (string) $t->reference,
                'status' => (string) $t->status,
                'location' => (string) ($t->location?->name ?? ''),
                'lines' => (int) $t->lines_count,
                'counted' => (int) $t->counted_count,
                'started_by' => StocktakeService::personName($t->starter),
                'submitted_by' => StocktakeService::personName($t->submitter),
                'approved_by' => StocktakeService::personName($t->approver),
                'created_at' => $t->created_at?->toIso8601String(),
                'posted_at' => $t->posted_at?->toIso8601String(),
            ])->values()->all(),
            'locations' => $locations->map(fn (StockLocation $l): array => [
                'id' => (int) $l->id,
                'name' => (string) $l->name,
                'kind' => (string) $l->kind,
                'store' => $l->store?->name,
            ])->values()->all(),
        ]);
    }

    public function store(StartStocktakeRequest $request): RedirectResponse
    {
        $location = StockLocation::query()->findOrFail($request->integer('stock_location_id'));
        $this->authorizeLocation($request->user(), $location);

        try {
            $take = $this->stocktakes->start($location, $request->user(), $request->input('note'));
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()->route('stock_keeper.stocktakes.show', $take)->with('success', "Count {$take->reference} started for {$location->name}.");
    }

    public function show(Request $request, Stocktake $stocktake): Response
    {
        $this->authorizeTake($request, $stocktake);

        return Inertia::render('StockKeeper/Stocktakes/Show', [
            'stocktake' => $this->stocktakes->present($stocktake, $request->user()),
        ]);
    }

    public function count(CountStocktakeLineRequest $request, Stocktake $stocktake): RedirectResponse
    {
        $this->authorizeTake($request, $stocktake);

        $variantId = $request->integer('item_variant_id') ?: null;

        if ($variantId === null) {
            $variant = $this->lookup->findVariant((string) $request->input('code'));

            if ($variant === null) {
                return back()->with('error', "Nothing has the barcode or SKU \"{$request->input('code')}\".");
            }

            $variantId = (int) $variant->id;
        }

        try {
            $this->stocktakes->count($stocktake, $variantId, $request->integer('counted'), $request->user());
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back();
    }

    public function submit(Request $request, Stocktake $stocktake): RedirectResponse
    {
        return $this->act($request, $stocktake, fn () => $this->stocktakes->submit($stocktake, $request->user()), 'Count submitted. Someone else approves it to book the differences.');
    }

    public function post(Request $request, Stocktake $stocktake): RedirectResponse
    {
        return $this->act($request, $stocktake, fn () => $this->stocktakes->post($stocktake, $request->user()), 'Count approved and differences booked.');
    }

    public function void(Request $request, Stocktake $stocktake): RedirectResponse
    {
        return $this->act($request, $stocktake, fn () => $this->stocktakes->void($stocktake), 'Count voided. Nothing was booked.');
    }

    private function act(Request $request, Stocktake $stocktake, callable $action, string $success): RedirectResponse
    {
        $this->authorizeTake($request, $stocktake);

        try {
            $action();
        } catch (InvalidArgumentException|InsufficientStockException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', $success);
    }

    private function authorizeTake(Request $request, Stocktake $stocktake): void
    {
        $location = $stocktake->location ?? StockLocation::query()->findOrFail($stocktake->stock_location_id);
        $this->authorizeLocation($request->user(), $location);
    }
}
