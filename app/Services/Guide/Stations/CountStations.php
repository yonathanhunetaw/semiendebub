<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Services\Inventory\StockKeeperVisibility;
use App\Services\Inventory\StocktakeService;

/**
 * The Counts desk: stocktakes of the Main Store's places. A keeper starts a
 * count, enters what they counted line by line, and submits it; someone else
 * approves it to book the differences (the stock keeper app, or the admin
 * app's Counts page for a manager or admin).
 */
class CountStations
{
    use BuildsStations;

    public function __construct(private readonly StocktakeService $stocktakes)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        return match ($app) {
            'stock_keeper' => [$this->keeperCounts($viewer, $storeId)],
            'admin' => [$this->approvals($storeId)],
            default => [],
        };
    }

    private function keeperCounts(User $viewer, int $storeId): array
    {
        $scope = app(StockKeeperVisibility::class)->scopeFor($viewer)['nodes'] ?? null;
        $places = StockLocation::query()
            ->where('store_id', $storeId)->where('is_stockable', true)
            ->whereNotIn('kind', StockLocation::OFF_NETWORK_KINDS)->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB])
            ->when($scope !== null, fn ($q) => $q->whereIn('id', array_map('intval', $scope)))
            ->orderBy('name')->get();

        $takes = Stocktake::query()
            ->whereIn('status', [Stocktake::COUNTING, Stocktake::SUBMITTED])
            ->whereIn('stock_location_id', StockLocation::query()->where('store_id', $storeId)->select('id'))
            ->when($scope !== null, fn ($q) => $q->whereIn('stock_location_id', array_map('intval', $scope)))
            ->with(['location', 'starter', 'submitter'])
            ->withCount(['lines', 'lines as counted_count' => fn ($q) => $q->whereNotNull('counted')])
            ->oldest('id')->limit(10)->get();

        $items = $takes->map(function (Stocktake $t) use ($viewer): array {
            $next = $t->status === Stocktake::COUNTING
                ? $t->lines()->whereNull('counted')->with('itemVariant.item')->orderBy('id')->first()
                : null;
            $actions = [];

            if ($next !== null) {
                $actions[] = $this->act('count', 'Count: '.($next->itemVariant?->item?->product_name ?? 'next line'), 'stock_keeper.stocktakes.count', ['stocktake' => $t->id], 'post',
                    ['item_variant_id' => (int) $next->item_variant_id],
                    [['name' => 'counted', 'label' => 'How many are there? (the book says '.(int) $next->expected.')', 'type' => 'number', 'default' => (int) $next->expected, 'min' => 0, 'required' => true]], 'primary');
            }

            if ($t->status === Stocktake::COUNTING && $t->counted_count > 0) {
                $actions[] = $this->act('submit', 'Submit for approval', 'stock_keeper.stocktakes.submit', ['stocktake' => $t->id], 'post', [], [], 'success');
            }

            if ($t->status === Stocktake::SUBMITTED && (int) $t->submitted_by !== (int) $viewer->id) {
                $actions[] = $this->act('post', 'Approve & book the differences', 'stock_keeper.stocktakes.post', ['stocktake' => $t->id], 'post', [], [], 'success', 'Book every difference into the stock?');
            }

            $actions[] = $this->act('void', 'Void', 'stock_keeper.stocktakes.void', ['stocktake' => $t->id], 'post', [], [], 'inherit', 'Throw this count away? Nothing is booked.');

            return [
                'id' => (string) $t->id,
                'title' => $t->reference.' · '.($t->location?->name ?? ''),
                'subtitle' => $t->counted_count.' of '.$t->lines_count.' lines counted',
                'chips' => [['label' => $t->status === Stocktake::SUBMITTED ? 'Waiting for approval' : 'Counting', 'tone' => $t->status === Stocktake::SUBMITTED ? 'warning' : 'info']],
                'actions' => array_values(array_filter($actions)),
            ];
        })->all();

        // Starting a count: one item, the place to count.
        if ($places->isNotEmpty()) {
            $start = $this->act('start', 'Start a count', 'stock_keeper.stocktakes.store', [], 'post', [], [
                ['name' => 'stock_location_id', 'label' => 'Where', 'type' => 'select', 'required' => true, 'default' => (string) $places->first()->id,
                    'options' => $places->map(fn (StockLocation $l): array => ['value' => (string) $l->id, 'label' => (string) $l->name])->all()],
            ], 'primary');

            if ($start !== null) {
                // The route answers with a redirect to the new count's page: the world leaves for it (stations.ts `navigates`).
                $start['navigates'] = true;
                array_unshift($items, ['id' => 'start', 'title' => 'Count a place', 'subtitle' => 'Start a stocktake of the shelf, the floor or the Remote Hub.', 'actions' => [$start]]);
            }
        }

        return $this->station('counts', 'Stocktakes', 'desk_counts', $items, [
            'blurb' => 'Count what is really there. Someone else approves a count before its differences are booked.',
            'empty' => 'No count is open.',
            'open' => $this->open('Open Stocktakes', 'stock_keeper.stocktakes.index'),
        ]);
    }

    /** The admin's Counts page: counts a keeper submitted, waiting for a second person. */
    private function approvals(int $storeId): array
    {
        $takes = Stocktake::query()
            ->where('status', Stocktake::SUBMITTED)
            ->whereIn('stock_location_id', StockLocation::query()->where('store_id', $storeId)->select('id'))
            ->with(['location', 'submitter'])
            ->withCount(['lines', 'lines as counted_count' => fn ($q) => $q->whereNotNull('counted')])
            ->oldest('submitted_at')->limit(10)->get();

        $items = $takes->map(fn (Stocktake $t): array => [
            'id' => (string) $t->id,
            'title' => $t->reference.' · '.($t->location?->name ?? ''),
            'subtitle' => 'Counted by '.StocktakeService::personName($t->submitter).' · '.$t->counted_count.' of '.$t->lines_count.' lines',
            'chips' => [['label' => 'Waiting for approval', 'tone' => 'warning']],
            'actions' => array_values(array_filter([
                $this->act('approve', 'Approve & book the differences', 'admin.inventory.counts.approve', ['stocktake' => $t->id], 'post', [], [], 'success', 'Book every difference into the stock?'),
            ])),
        ])->all();

        return $this->station('counts', 'Counts to approve', 'desk_counts', $items, [
            'blurb' => 'Stocktakes a keeper submitted. A second person approves them to book the differences.',
            'empty' => 'No count is waiting for approval.',
            'open' => $this->open('Open Counts', 'admin.inventory.counts.index'),
        ]);
    }
}
