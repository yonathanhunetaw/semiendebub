<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\StocktakeLine;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Services\StockService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Stocktakes (cycle counts) of one location.
 *
 *   start    snapshot what the ledger holds per variant (expected)
 *   count    people count lines, by hand or by scanning; an item found that
 *            the ledger did not expect is added with expected = 0
 *   submit   counting stops; variances are fixed
 *   post     someone other than the submitter (admins excepted) approves:
 *            each variance (counted − expected) is booked as an adjustment
 *   void     abandon it; nothing is booked
 *
 * Variances are applied as deltas against the snapshot, so stock that moved
 * in or out during the count is not erased.
 */
class StocktakeService
{
    public function __construct(
        private readonly StockService $stock,
        private readonly PackagingLadder $ladder,
        private readonly StockPermissions $permissions,
    ) {
    }

    public function start(StockLocation $location, User $by, ?string $note = null): Stocktake
    {
        if (! $location->is_stockable || $location->isTransit()) {
            throw new InvalidArgumentException("{$location->name} cannot be counted.");
        }

        $open = Stocktake::query()
            ->where('stock_location_id', $location->id)
            ->whereIn('status', [Stocktake::COUNTING, Stocktake::SUBMITTED])
            ->first();

        if ($open !== null) {
            throw new InvalidArgumentException("{$location->name} already has a count open ({$open->reference}).");
        }

        return DB::transaction(function () use ($location, $by, $note): Stocktake {
            $take = Stocktake::query()->create([
                'reference' => 'ST-'.now()->format('ymd').'-'.Str::upper(Str::random(4)),
                'stock_location_id' => $location->id,
                'status' => Stocktake::COUNTING,
                'note' => $note,
                'started_by' => $by->id,
            ]);

            ItemStock::query()
                ->where('stock_location_id', $location->id)
                ->where('quantity', '!=', 0)
                ->get(['item_variant_id', 'quantity'])
                ->each(fn (ItemStock $row) => $take->lines()->create([
                    'item_variant_id' => (int) $row->item_variant_id,
                    'expected' => (int) $row->quantity,
                ]));

            return $take;
        });
    }

    /** Record (or correct) a line's count; adds a line for an unexpected item. */
    public function count(Stocktake $take, int $itemVariantId, int $counted, User $by): StocktakeLine
    {
        $this->assertStatus($take, Stocktake::COUNTING, 'counted');

        if ($counted < 0) {
            throw new InvalidArgumentException('A count cannot be negative.');
        }

        $line = $take->lines()->firstOrNew(['item_variant_id' => $itemVariantId]);

        if (! $line->exists) {
            ItemVariant::query()->findOrFail($itemVariantId);
            $line->expected = 0;
        }

        $line->fill(['counted' => $counted, 'counted_by' => $by->id, 'counted_at' => now()])->save();

        return $line;
    }

    public function submit(Stocktake $take, User $by): Stocktake
    {
        $this->assertStatus($take, Stocktake::COUNTING, 'submitted');

        if (! $take->lines()->whereNotNull('counted')->exists()) {
            throw new InvalidArgumentException('Count at least one line before submitting.');
        }

        $take->update(['status' => Stocktake::SUBMITTED, 'submitted_by' => $by->id, 'submitted_at' => now()]);

        return $take->refresh();
    }

    /**
     * Book every variance. Uncounted lines are left alone.
     *
     * @throws InvalidArgumentException|InsufficientStockException
     */
    public function post(Stocktake $take, User $by): Stocktake
    {
        $this->assertStatus($take, Stocktake::SUBMITTED, 'posted');

        if (! $this->permissions->isGlobalAdmin($by) && (int) $take->submitted_by === (int) $by->id) {
            throw new InvalidArgumentException('Someone other than the person who submitted the count approves it.');
        }

        return DB::transaction(function () use ($take, $by): Stocktake {
            $take->lines()->whereNotNull('counted')->get()->each(function (StocktakeLine $line) use ($take, $by): void {
                $delta = (int) $line->counted - (int) $line->expected;

                if ($delta !== 0) {
                    $this->stock->adjust((int) $line->item_variant_id, (int) $take->stock_location_id, $delta, [
                        'reason' => "Stocktake {$take->reference}",
                        'reference' => $take,
                        'user_id' => $by->id,
                    ]);
                }
            });

            $take->update(['status' => Stocktake::POSTED, 'approved_by' => $by->id, 'posted_at' => now()]);

            return $take->refresh();
        });
    }

    public function void(Stocktake $take): Stocktake
    {
        if (! in_array($take->status, [Stocktake::COUNTING, Stocktake::SUBMITTED], true)) {
            throw new InvalidArgumentException("{$take->reference} is already {$take->status}.");
        }

        $take->update(['status' => Stocktake::VOIDED, 'voided_at' => now()]);

        return $take->refresh();
    }

    /**
     * The stocktake as the page shows it.
     *
     * @return array<string, mixed>
     */
    public function present(Stocktake $take, ?User $viewer = null): array
    {
        $take->loadMissing(['location', 'starter', 'submitter', 'approver', 'lines.itemVariant.item', 'lines.itemVariant.itemColor', 'lines.itemVariant.itemSize']);
        $byVariant = $this->ladder->piecesPerUnitByVariant();

        $lines = $take->lines
            ->map(function (StocktakeLine $line) use ($byVariant): array {
                $variant = $line->itemVariant;
                $itemId = (int) ($variant?->item_id ?? 0);
                $per = (int) ($byVariant[(int) $line->item_variant_id] ?? 1);
                $unit = $this->unitName((int) $line->item_variant_id, $itemId, $per);
                $variance = $line->counted !== null ? (int) $line->counted - (int) $line->expected : null;

                return [
                    'id' => (int) $line->id,
                    'item_variant_id' => (int) $line->item_variant_id,
                    'item_id' => $itemId,
                    'name' => (string) ($variant?->item?->product_name ?? 'Unknown item'),
                    'variant' => trim(implode(' · ', array_filter([$variant?->itemColor?->name, $variant?->itemSize?->name]))),
                    'sku' => $variant?->sku,
                    'barcode' => $variant?->barcode,
                    'unit' => $unit,
                    'pieces_per_unit' => $per,
                    'expected' => (int) $line->expected,
                    'counted' => $line->counted,
                    'variance' => $variance,
                    'counted_at' => $line->counted_at?->toIso8601String(),
                ];
            })
            ->sortBy(fn (array $l): string => ($l['counted'] === null ? '0' : '1').$l['name'])
            ->values();

        $counted = $lines->whereNotNull('counted');

        return [
            'id' => (int) $take->id,
            'reference' => (string) $take->reference,
            'status' => (string) $take->status,
            'note' => $take->note,
            'location' => ['id' => (int) $take->stock_location_id, 'name' => (string) ($take->location?->name ?? ''), 'kind' => (string) ($take->location?->kind ?? '')],
            'started_by' => self::personName($take->starter),
            'submitted_by' => self::personName($take->submitter),
            'approved_by' => self::personName($take->approver),
            'created_at' => $take->created_at?->toIso8601String(),
            'submitted_at' => $take->submitted_at?->toIso8601String(),
            'posted_at' => $take->posted_at?->toIso8601String(),
            'totals' => [
                'lines' => $lines->count(),
                'counted' => $counted->count(),
                'matching' => $counted->where('variance', 0)->count(),
                'over' => $counted->where('variance', '>', 0)->count(),
                'short' => $counted->where('variance', '<', 0)->count(),
            ],
            'can_approve' => $viewer !== null && $take->status === Stocktake::SUBMITTED
                && ($this->permissions->isGlobalAdmin($viewer) || (int) $take->submitted_by !== (int) $viewer->id),
            'lines' => $lines->all(),
        ];
    }

    public static function personName(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        return trim("{$user->first_name} {$user->last_name}") ?: ($user->email ?? null);
    }

    private function unitName(int $variantId, int $itemId, int $per): string
    {
        foreach ($this->ladder->forItem($itemId) as $tier) {
            if ((int) $tier['pieces'] === $per) {
                return (string) $tier['name'];
            }
        }

        return $per > 1 ? "Pack of {$per}" : 'Piece';
    }

    private function assertStatus(Stocktake $take, string $status, string $verb): void
    {
        if ($take->status !== $status) {
            throw new InvalidArgumentException("{$take->reference} is {$take->status} and can no longer be {$verb}.");
        }
    }
}
