<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Lifecycle of a stock transfer: queued → in transit → completed.
 *
 * Stock leaves the origin at dispatch and lands at the destination on
 * completion, so units are never counted in two places at once.
 */
class TransferWorkflowService
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_IN_TRANSIT = 'in_transit';

    public const STATUS_COMPLETED = 'completed';

    public const STATUS_CANCELLED = 'cancelled';

    /**
     * Raise a transfer. It holds no stock until it is dispatched.
     */
    public function create(
        int $variantId,
        int $fromStoreId,
        int $toStoreId,
        int $quantity,
        ?int $initiatedBy = null,
        ?string $notes = null,
    ): Transfer {
        return Transfer::create([
            'reference' => $this->nextReference(),
            'item_variant_id' => $variantId,
            'from_store_id' => $fromStoreId,
            'to_store_id' => $toStoreId,
            'quantity' => $quantity,
            'status' => self::STATUS_PENDING,
            'initiated_by' => $initiatedBy,
            'notes' => $notes,
        ]);
    }

    /**
     * Dispatch: stock leaves the origin now.
     */
    public function markDispatched(Transfer $transfer): bool
    {
        if ($transfer->status !== self::STATUS_PENDING) {
            return false;
        }

        DB::transaction(function () use ($transfer): void {
            $this->moveStock(
                $transfer->item_variant_id,
                Store::class,
                (int) $transfer->from_store_id,
                -1 * (int) $transfer->quantity,
            );

            $transfer->update([
                'status' => self::STATUS_IN_TRANSIT,
                'dispatched_at' => now(),
            ]);
        });

        return true;
    }

    /**
     * Completion: stock lands at the destination.
     */
    public function markCompleted(Transfer $transfer): bool
    {
        if ($transfer->status !== self::STATUS_IN_TRANSIT) {
            return false;
        }

        DB::transaction(function () use ($transfer): void {
            $this->moveStock(
                $transfer->item_variant_id,
                Store::class,
                (int) $transfer->to_store_id,
                (int) $transfer->quantity,
            );

            $transfer->update([
                'status' => self::STATUS_COMPLETED,
                'completed_at' => now(),
            ]);
        });

        return true;
    }

    /**
     * Cancel. Stock already dispatched is returned to the origin.
     */
    public function cancel(Transfer $transfer, ?int $cancelledBy = null): bool
    {
        if (in_array($transfer->status, [self::STATUS_COMPLETED, self::STATUS_CANCELLED], true)) {
            return false;
        }

        DB::transaction(function () use ($transfer, $cancelledBy): void {
            if ($transfer->status === self::STATUS_IN_TRANSIT) {
                $this->moveStock(
                    $transfer->item_variant_id,
                    Store::class,
                    (int) $transfer->from_store_id,
                    (int) $transfer->quantity,
                );
            }

            $transfer->update([
                'status' => self::STATUS_CANCELLED,
                'cancelled_at' => now(),
                'cancelled_by' => $cancelledBy,
            ]);
        });

        return true;
    }

    /**
     * @return array<string, int>
     */
    public function statusCounts(): array
    {
        $counts = Transfer::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return [
            'all' => (int) $counts->sum(),
            self::STATUS_PENDING => (int) ($counts[self::STATUS_PENDING] ?? 0),
            self::STATUS_IN_TRANSIT => (int) ($counts[self::STATUS_IN_TRANSIT] ?? 0),
            self::STATUS_COMPLETED => (int) ($counts[self::STATUS_COMPLETED] ?? 0),
            self::STATUS_CANCELLED => (int) ($counts[self::STATUS_CANCELLED] ?? 0),
        ];
    }

    /**
     * @return array<string, mixed>
     */
    public function present(Transfer $transfer): array
    {
        $variant = $transfer->itemVariant;

        return [
            'id' => (int) $transfer->id,
            'reference' => (string) $transfer->reference,
            'product_name' => (string) ($variant?->item?->product_name ?? 'Unknown product'),
            'sku' => $variant?->sku,
            'quantity' => (int) $transfer->quantity,
            'status' => (string) $transfer->status,
            'from_store' => $transfer->fromStore?->name,
            'to_store' => $transfer->toStore?->name,
            'initiated_by' => trim((string) ($transfer->initiator?->first_name . ' ' . $transfer->initiator?->last_name)) ?: null,
            'notes' => $transfer->notes,
            'dispatched_at' => $transfer->dispatched_at?->toIso8601String(),
            'completed_at' => $transfer->completed_at?->toIso8601String(),
            'cancelled_at' => $transfer->cancelled_at?->toIso8601String(),
            'created_at' => $transfer->created_at?->toIso8601String(),
        ];
    }

    /**
     * Apply a signed delta to a ledger row, creating it when stock first
     * arrives at a location.
     */
    private function moveStock(int $variantId, string $locationType, int $locationId, int $delta): void
    {
        $stock = ItemStock::firstOrCreate(
            [
                'item_variant_id' => $variantId,
                'location_type' => $locationType,
                'location_id' => $locationId,
            ],
            ['quantity' => 0, 'min_stock_level' => 0],
        );

        // Never drive a ledger row negative: a short origin books out what it has.
        $applied = $delta < 0
            ? -1 * min((int) $stock->quantity, abs($delta))
            : $delta;

        $stock->increment('quantity', $applied);
    }

    private function nextReference(): string
    {
        return 'TRF-' . now()->format('ymd') . '-' . Str::upper(Str::random(5));
    }
}
