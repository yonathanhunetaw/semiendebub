<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\ProductIdeaException;
use App\Models\Auth\User;
use App\Models\Inventory\ItemStock;
use App\Models\Inventory\StockLocation;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentCost;
use App\Models\Procurement\ConsignmentLine;
use App\Models\Procurement\ItemCostEntry;
use App\Services\Inventory\ReceivingService;
use App\Services\Inventory\StockLocationTree;
use App\Services\Inventory\StockPermissions;
use Illuminate\Support\Facades\DB;

/**
 * The last two steps of a consignment (docs/plans/procurement-pipeline.md, PP5).
 *
 * Receiving: the hub's people (or a global admin) count each line in at a
 * Main Hub. Whole units move from the stage it was at into the hub; extra
 * units are booked in; missing units stay at that stage as a "short"
 * discrepancy, settled later as found or lost by someone else; damaged
 * units are written off. Each order line's received quantity, and the
 * order's status, follow (PurchaseReceipts).
 *
 * Finalising the costs comes later, once every cost is confirmed (owner,
 * 2026-10-21: receive now, cost later): each line's landed cost per good
 * unit, and each SKU's weighted-average cost, written once, logged in
 * item_cost_entries. After that no cost can be added.
 */
class ConsignmentReceiving
{
    public function __construct(
        private readonly ConsignmentService $consignments,
        private readonly ReceivingService $receiving,
        private readonly StockLocationTree $tree,
        private readonly StockPermissions $permissions,
    ) {
    }

    /** A global admin, or a stock keeper who may take stock in at this hub. */
    public function mayReceive(?User $user, StockLocation $hub): bool
    {
        if ($user === null || $hub->kind !== StockLocation::KIND_MAIN_HUB) {
            return false;
        }

        return $this->permissions->isGlobalAdmin($user)
            || ($user->roleKey() === 'stock_keeper' && $hub->canBeOperatedBy($user));
    }

    /**
     * @param  array<int, array{received: int|string, damaged?: int|string|null, note?: ?string}>  $counts  keyed by consignment line id; a line left out arrived in full
     *
     * @throws ProductIdeaException
     */
    public function receive(Consignment $consignment, User $by, StockLocation $hub, array $counts): Consignment
    {
        if (! $this->mayReceive($by, $hub)) {
            throw new ProductIdeaException('Only the hub\'s stock keepers or a global admin take goods in there.', 403);
        }

        return DB::transaction(function () use ($consignment, $by, $hub, $counts): Consignment {
            $consignment = Consignment::query()->with('lines')->lockForUpdate()->findOrFail($consignment->id);

            if (! $consignment->isInTransit()) {
                throw new ProductIdeaException($consignment->stage === Consignment::RECEIVED ? 'This consignment is already received.' : 'Only goods on their way can be received.');
            }

            $from = $this->tree->inbound($consignment->stage);
            $context = ['user_id' => $by->id, 'reference' => $consignment, 'reason' => "Received: consignment {$consignment->reference}"];

            foreach ($consignment->lines as $line) {
                $count = $counts[$line->id] ?? null;
                $received = $count !== null ? max(0, (int) $count['received']) : (int) $line->quantity;
                $damaged = $count !== null ? min($received, max(0, (int) ($count['damaged'] ?? 0))) : 0;
                $note = $count['note'] ?? null;

                $this->receiving->landFromInbound($line, (int) $line->item_variant_id, $from, $hub, (int) $line->quantity, $received, $damaged, $context, $by, $note);

                $line->update(['received_quantity' => $received, 'damaged_quantity' => $damaged, 'receipt_note' => $note]);
                PurchaseReceipts::credit($line, $received);
            }

            $consignment->update([
                'stage' => Consignment::RECEIVED,
                'stage_dates' => ($consignment->stage_dates ?? []) + [Consignment::RECEIVED => \App\Services\Workforce\LocalTime::dateOf()],
                'received_location_id' => $hub->id,
                'received_from' => $consignment->stage,
                'received_at' => now(),
                'received_by' => $by->id,
            ]);

            return $consignment->refresh();
        });
    }

    /** Why the costs cannot be finalised yet, or null when they can. */
    public function finaliseBlocker(Consignment $consignment): ?string
    {
        return match (true) {
            $consignment->costs_finalised_at !== null => 'The costs are already finalised.',
            $consignment->stage !== Consignment::RECEIVED => 'Receive the goods first.',
            $consignment->costs()->whereNull('confirmed_at')->whereNull('rejected_at')->exists() => 'A cost is still waiting to be confirmed.',
            default => null,
        };
    }

    /** @throws ProductIdeaException */
    public function finaliseCosts(Consignment $consignment, User $by): Consignment
    {
        if (! $this->consignments->mayManage($by)) {
            throw new ProductIdeaException('Only procurement or a global admin finalises the costs.', 403);
        }

        return DB::transaction(function () use ($consignment, $by): Consignment {
            $consignment = Consignment::query()->with(['lines', 'costs'])->lockForUpdate()->findOrFail($consignment->id);

            if (($blocker = $this->finaliseBlocker($consignment)) !== null) {
                throw new ProductIdeaException($blocker);
            }

            $shares = collect($this->consignments->allocation($consignment)['lines'])->keyBy('id');

            foreach ($consignment->lines->sortBy('id') as $line) {
                $good = (int) $line->goodUnits();

                if ($good <= 0) {
                    continue;
                }

                // The whole line's landed cost is carried by the units that arrived whole.
                $unit = round((float) $shares[$line->id]['landed_total_etb'] / $good, 4);
                $line->update(['landed_unit_etb' => $unit]);
                $this->average($line, $good, $unit, $by);
            }

            $consignment->update(['costs_finalised_at' => now(), 'costs_finalised_by' => $by->id]);

            return $consignment->refresh();
        });
    }

    /**
     * Weighted average: (on hand before × cost before + batch × its cost) ÷ both.
     * "On hand before" is what the network holds now (goods still on their way
     * in left out, as they have no cost yet) less this batch; a SKU with no
     * cost yet, or nothing else on hand, takes the batch's cost.
     */
    private function average(ConsignmentLine $line, int $good, float $unit, User $by): void
    {
        /** @var ItemVariant $variant */
        $variant = ItemVariant::query()->lockForUpdate()->findOrFail($line->item_variant_id);

        $onHand = (int) ItemStock::query()
            ->where('item_variant_id', $variant->id)
            ->whereNotIn('stock_location_id', StockLocation::query()->where('kind', StockLocation::KIND_INBOUND)->select('id'))
            ->sum('quantity');
        $before = max(0, $onHand - $good);
        $costBefore = $variant->unit_cost !== null ? (float) $variant->unit_cost : null;

        $after = $costBefore === null || $before === 0
            ? $unit
            : round(($before * $costBefore + $good * $unit) / ($before + $good), 4);

        ItemCostEntry::query()->create([
            'item_variant_id' => $variant->id,
            'consignment_line_id' => $line->id,
            'quantity' => $good,
            'batch_unit_cost' => $unit,
            'on_hand_before' => $before,
            'cost_before' => $costBefore,
            'cost_after' => $after,
            'created_by' => $by->id,
        ]);

        $variant->forceFill(['unit_cost' => $after, 'unit_cost_at' => now()])->save();
    }
}
