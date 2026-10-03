<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Store\StoreVariant;
use App\Services\Inventory\ReplenishmentProposalService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Notices the moment a location falls through its floor.
 *
 * `item_stocks` is where every positional movement lands — a sale picked off a
 * shelf, a transfer received into a back room, a stock count corrected — so
 * watching this one table catches all of them without each writer having to
 * remember to ask about capacity.
 *
 * Two deliberate narrowings keep it cheap:
 *
 *   - Only the store variants of the changed item variant are swept, not the
 *     catalogue.
 *   - The sweep runs after the surrounding transaction commits, so a transfer
 *     that moves stock in two steps is judged on its finished state rather than
 *     mid-flight, and a rolled-back write proposes nothing.
 *
 * It never throws into the write that triggered it: a sale must not fail
 * because a suggestion could not be filed.
 *
 * @see \App\Console\Commands\Inventory\ProposeReplenishmentTransfersCommand
 *      for the scheduled half, which also catches bands breached while this was
 *      switched off.
 */
class ItemStockObserver
{
    public bool $afterCommit = true;

    public function __construct(private readonly ReplenishmentProposalService $planner)
    {
    }

    public function created(Model $stock): void
    {
        $this->review($stock);
    }

    public function updated(Model $stock): void
    {
        // Nothing to review unless the figure itself moved; touching a min
        // stock level or a timestamp cannot breach a capacity band.
        if (! $stock->wasChanged('quantity')) {
            return;
        }

        $this->review($stock);
    }

    public function deleted(Model $stock): void
    {
        $this->review($stock);
    }

    /**
     * Sweep the bands that could have been breached by this row.
     *
     * The row names one location, but a shelf movement also changes the derived
     * back-room figure and a store-level movement changes both, so the sweep is
     * by store variant rather than by location.
     */
    private function review(Model $stock): void
    {
        if (! config('inventory.auto_replenishment.enabled', true)
            || ! config('inventory.auto_replenishment.observe_stock_changes', true)) {
            return;
        }

        $itemVariantId = (int) ($stock->item_variant_id ?? 0);

        if ($itemVariantId === 0) {
            return;
        }

        try {
            $storeVariantIds = StoreVariant::query()
                ->where('item_variant_id', $itemVariantId)
                ->pluck('id')
                ->map(fn (mixed $id): int => (int) $id)
                ->all();

            if ($storeVariantIds === []) {
                return;
            }

            $this->planner->sweep($storeVariantIds);
        } catch (Throwable $exception) {
            // A proposal is advisory. Losing one must never fail the sale,
            // transfer or stock count that was being recorded.
            Log::warning('Replenishment review failed after a stock change', [
                'item_variant_id' => $itemVariantId,
                'exception' => $exception->getMessage(),
            ]);
        }
    }
}
