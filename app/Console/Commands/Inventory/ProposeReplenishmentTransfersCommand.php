<?php

declare(strict_types=1);

namespace App\Console\Commands\Inventory;

use App\Models\Store\StoreVariant;
use App\Services\Inventory\ReplenishmentProposalService;
use Illuminate\Console\Command;

/**
 * The scheduled half of automated replenishment.
 *
 * The observer on item_stocks reacts to movements, but it cannot see a band
 * that was breached while it was switched off, one created after the stock had
 * already fallen, or a figure that drifted through a direct database edit. This
 * sweep is the backstop, and it is also what makes the feature inspectable:
 * run it with --dry-run and it prints exactly what it would propose.
 *
 *   php artisan inventory:propose-replenishment --dry-run
 *   php artisan inventory:propose-replenishment --store=3
 */
class ProposeReplenishmentTransfersCommand extends Command
{
    protected $signature = 'inventory:propose-replenishment
                            {--store= : Limit the sweep to one store id}
                            {--dry-run : Report what would be proposed without writing anything}';

    protected $description = 'Propose pending replenishment transfers for locations at or below their minimum capacity';

    public function handle(ReplenishmentProposalService $planner): int
    {
        $storeId = $this->option('store') !== null ? (int) $this->option('store') : null;
        $dryRun = (bool) $this->option('dry-run');

        $storeVariantIds = $storeId === null
            ? []
            : StoreVariant::query()->where('store_id', $storeId)->pluck('id')->map(fn (mixed $id): int => (int) $id)->all();

        if ($storeId !== null && $storeVariantIds === []) {
            $this->warn("Store #{$storeId} has no variants.");

            return self::SUCCESS;
        }

        if ($dryRun) {
            return $this->report($planner, $storeVariantIds);
        }

        $outcome = $planner->sweep($storeVariantIds);

        $this->info(sprintf('%d proposal(s) raised, awaiting store manager approval.', count($outcome['created'])));

        foreach ($outcome['created'] as $transfer) {
            $this->line(sprintf(
                '  %s  %d unit(s) → %s',
                $transfer->reference,
                $transfer->quantity,
                $transfer->toStore?->name ?? 'destination',
            ));
        }

        if ($outcome['shipment_candidates'] !== []) {
            $this->newLine();
            $this->warn(sprintf(
                '%d breach(es) are warehouse-to-warehouse and need a Shipment, not a Transfer:',
                count($outcome['shipment_candidates']),
            ));

            foreach ($outcome['shipment_candidates'] as $candidate) {
                $this->line(sprintf(
                    '  %s → %s  (short %d)',
                    $candidate['source']['name'] ?? 'source',
                    $candidate['destination']['name'] ?? 'destination',
                    $candidate['shortfall'],
                ));
            }
        }

        return self::SUCCESS;
    }

    /**
     * @param  array<int, int>  $storeVariantIds
     */
    private function report(ReplenishmentProposalService $planner, array $storeVariantIds): int
    {
        // Rolled back, so --dry-run is honest about writing nothing while still
        // exercising the real planner rather than a parallel description of it.
        \Illuminate\Support\Facades\DB::beginTransaction();

        try {
            $outcome = $planner->sweep($storeVariantIds);

            $rows = [];

            foreach ($outcome['created'] as $transfer) {
                $rows[] = [
                    'Would propose',
                    $transfer->itemVariant?->sku ?? (string) $transfer->item_variant_id,
                    (string) $transfer->quantity,
                    $transfer->notes ?? '',
                ];
            }

            foreach ($outcome['shipment_candidates'] as $candidate) {
                $rows[] = [
                    'Needs shipment',
                    $candidate['capacity']->itemVariant?->sku ?? '',
                    (string) $candidate['shortfall'],
                    $candidate['reason'] ?? '',
                ];
            }

            foreach ($outcome['skipped'] as $skipped) {
                $rows[] = [
                    'Skipped',
                    $skipped['capacity']->itemVariant?->sku ?? '',
                    (string) $skipped['shortfall'],
                    $skipped['reason'] ?? '',
                ];
            }

            if ($rows === []) {
                $this->info('Every monitored location is above its minimum.');
            } else {
                $this->table(['Outcome', 'SKU', 'Units', 'Detail'], $rows);
            }
        } finally {
            \Illuminate\Support\Facades\DB::rollBack();
        }

        return self::SUCCESS;
    }
}
