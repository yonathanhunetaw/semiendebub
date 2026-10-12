<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\ReceiptDiscrepancy;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\Transfer;
use App\Services\StockService;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;

/**
 * Receiving with discrepancies, for shipment lines and transfers alike.
 *
 * Everything sent sits In Delivery (the courier's custody) until the
 * destination takes it. The receiver says how many arrived and how many of
 * those are damaged; then, per line:
 *
 *   arrived ≤ sent   the arrived units land; the rest stays In Delivery as a
 *                    `short` discrepancy until it is found (lands) or lost
 *                    (written off from custody)
 *   arrived > sent   all sent units land, the extra is booked in, and an
 *                    `over` discrepancy is left for review
 *   damaged          lands with the rest, then is written off at once and
 *                    logged as a resolved `damaged` discrepancy
 *
 * With no count recorded, a line lands in full, exactly as before.
 * Stock is conserved: every unit sent is either landed, written off, or still
 * In Delivery against an open discrepancy.
 */
class ReceivingService
{
    public function __construct(
        private readonly StockService $stock,
        private readonly StockPermissions $permissions,
    ) {
    }

    /**
     * Save the receiver's count on a shipment before it is signed in.
     *
     * @param  array<int, array{received: int, damaged?: int|null, note?: string|null}>  $counts  keyed by item_variant_id
     */
    public function recordShipmentCounts(Shipment $shipment, array $counts): void
    {
        $shipment->loadMissing('items');

        DB::transaction(function () use ($shipment, $counts): void {
            foreach ($shipment->items as $line) {
                $count = $counts[(int) $line->item_variant_id] ?? null;

                if ($count === null) {
                    continue;
                }

                [$received, $damaged] = $this->validCount((int) $count['received'], (int) ($count['damaged'] ?? 0));

                $line->update([
                    'received_quantity' => $received,
                    'damaged_quantity' => $damaged,
                    'receipt_note' => $count['note'] ?? null,
                ]);
            }
        });
    }

    /**
     * Land one sent line at its destination, applying the receiver's count.
     *
     * Called inside the shipment's / transfer's receive transaction.
     *
     * @param  array<string, mixed>  $context  journal context (reason, reference)
     */
    public function land(
        Model $receivable,
        int $itemVariantId,
        StockLocation $destination,
        int $sent,
        ?int $received,
        ?int $damaged,
        ?int $courierId,
        array $context,
        ?User $by = null,
        ?string $note = null,
    ): void {
        if ($sent <= 0) {
            return;
        }

        $arrived = $received ?? $sent;
        $damaged = min(max(0, (int) $damaged), $arrived);
        $landing = min($arrived, $sent);

        if ($landing > 0) {
            $this->stock->handOverFromCourier($itemVariantId, $destination, $landing, $courierId, $context);
        }

        if ($arrived > $sent) {
            $over = $arrived - $sent;
            $this->stock->receive($itemVariantId, $destination, $over, $context + ['reason' => 'Over-delivery']);
            $this->log($receivable, $itemVariantId, $destination, $courierId, ReceiptDiscrepancy::OVER, $sent, $arrived, $over, $note, $by);
        }

        if ($arrived < $sent) {
            // The missing units stay in the courier's custody until resolved.
            $this->log($receivable, $itemVariantId, $destination, $courierId, ReceiptDiscrepancy::SHORT, $sent, $arrived, $sent - $arrived, $note, $by);
        }

        if ($damaged > 0) {
            $this->stock->writeOff($itemVariantId, $destination, $damaged, $context + ['reason' => 'Damaged on receipt']);
            $row = $this->log($receivable, $itemVariantId, $destination, $courierId, ReceiptDiscrepancy::DAMAGED, $sent, $arrived, $damaged, $note, $by);
            $row->update([
                'status' => ReceiptDiscrepancy::RESOLVED,
                'resolution' => 'written_off',
                'resolved_by' => $by?->id,
                'resolved_at' => now(),
            ]);
        }
    }

    /**
     * Settle an open discrepancy.
     *
     *   short + found  the missing units turn up: they land at the destination
     *   short + lost   they never will: written off from the courier's custody
     *   over  + accepted  the extra stays booked in
     *
     * @throws InvalidArgumentException
     */
    public function resolve(ReceiptDiscrepancy $row, string $resolution, ?string $note, User $by): ReceiptDiscrepancy
    {
        if ($row->status !== ReceiptDiscrepancy::OPEN) {
            throw new InvalidArgumentException("{$row->reference} is already settled.");
        }

        if (! $this->canResolve($by, $row)) {
            throw new InvalidArgumentException('Someone other than the receiver settles a discrepancy: a manager of that place, another stock keeper or an admin.');
        }

        $allowed = $row->kind === ReceiptDiscrepancy::SHORT ? ['found', 'lost'] : ['accepted'];

        if (! in_array($resolution, $allowed, true)) {
            throw new InvalidArgumentException('A '.$row->kind.' discrepancy is settled as '.implode(' or ', $allowed).'.');
        }

        return DB::transaction(function () use ($row, $resolution, $note, $by): ReceiptDiscrepancy {
            $context = ['reason' => "Discrepancy {$row->reference}", 'reference' => $row->receivable, 'user_id' => $by->id];
            $courierId = $row->courier_id !== null ? (int) $row->courier_id : null;

            if ($row->kind === ReceiptDiscrepancy::SHORT && $resolution === 'found') {
                $this->stock->handOverFromCourier((int) $row->item_variant_id, (int) $row->stock_location_id, (int) $row->quantity, $courierId, $context);
            }

            if ($row->kind === ReceiptDiscrepancy::SHORT && $resolution === 'lost') {
                $this->stock->writeOffInCustody((int) $row->item_variant_id, (int) $row->quantity, $courierId, $context);
            }

            $row->update([
                'status' => ReceiptDiscrepancy::RESOLVED,
                'resolution' => $resolution,
                'resolution_note' => $note,
                'resolved_by' => $by->id,
                'resolved_at' => now(),
            ]);

            return $row->refresh();
        });
    }

    /** Two people: whoever recorded it does not settle it (admins excepted). */
    public function canResolve(?User $user, ReceiptDiscrepancy $row): bool
    {
        if ($user === null) {
            return false;
        }

        if ($this->permissions->isAdmin($user)) {
            return true;
        }

        if ((int) $row->recorded_by === (int) $user->id) {
            return false;
        }

        $location = $row->location;

        return ($location !== null && $this->permissions->isManagerOf($user, $location))
            || $user->roleKey() === 'stock_keeper';
    }

    /** @return array{0: int, 1: int} */
    private function validCount(int $received, int $damaged): array
    {
        if ($received < 0 || $damaged < 0) {
            throw new InvalidArgumentException('Counts cannot be negative.');
        }

        if ($damaged > $received) {
            throw new InvalidArgumentException('Damaged units are part of what arrived, so they cannot be more than it.');
        }

        return [$received, $damaged];
    }

    private function log(Model $receivable, int $itemVariantId, StockLocation $at, ?int $courierId, string $kind, int $expected, int $received, int $quantity, ?string $note, ?User $by): ReceiptDiscrepancy
    {
        return ReceiptDiscrepancy::query()->create([
            'reference' => 'RD-'.now()->format('ymd').'-'.Str::upper(Str::random(5)),
            'receivable_type' => $receivable::class,
            'receivable_id' => $receivable->getKey(),
            'item_variant_id' => $itemVariantId,
            'stock_location_id' => $at->id,
            'courier_id' => $courierId,
            'kind' => $kind,
            'expected' => $expected,
            'received' => $received,
            'quantity' => $quantity,
            'note' => $note,
            'status' => ReceiptDiscrepancy::OPEN,
            'recorded_by' => $by?->id,
        ]);
    }

    /** Transfers carry their count on the row itself. */
    public function landTransfer(Transfer $transfer, StockLocation $destination, array $context, ?User $by): void
    {
        $this->land(
            $transfer,
            (int) $transfer->item_variant_id,
            $destination,
            (int) $transfer->quantity,
            $transfer->received_quantity,
            $transfer->damaged_quantity,
            $transfer->courier_id !== null ? (int) $transfer->courier_id : null,
            $context,
            $by,
            $transfer->notes,
        );
    }
}
