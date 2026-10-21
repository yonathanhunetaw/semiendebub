<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Models\Procurement\ConsignmentLine;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\PurchaseLine;

/**
 * What arrived of a purchase order: each line's received quantity, and the
 * order's status from it (partly received → received). Nothing else sets
 * those (procurement pipeline PP5).
 */
class PurchaseReceipts
{
    /** Units of this consignment line that reached a hub (damaged ones included: the supplier did deliver them). */
    public static function credit(ConsignmentLine $line, int $units): void
    {
        if ($units <= 0) {
            return;
        }

        /** @var PurchaseLine $purchaseLine */
        $purchaseLine = PurchaseLine::query()->lockForUpdate()->findOrFail($line->purchase_line_id);
        $purchaseLine->increment('received_quantity', $units);

        self::syncStatus($purchaseLine->purchase()->firstOrFail());
    }

    public static function syncStatus(Purchase $purchase): void
    {
        if (! in_array($purchase->status, [Purchase::STATUS_ORDERED, Purchase::STATUS_PARTIALLY_RECEIVED], true)) {
            return;
        }

        $lines = $purchase->lines()->get(['quantity', 'received_quantity']);

        $status = match (true) {
            $lines->isNotEmpty() && $lines->every(fn (PurchaseLine $l): bool => (int) $l->received_quantity >= (int) $l->quantity) => Purchase::STATUS_RECEIVED,
            $lines->contains(fn (PurchaseLine $l): bool => (int) $l->received_quantity > 0) => Purchase::STATUS_PARTIALLY_RECEIVED,
            default => $purchase->status,
        };

        if ($status !== $purchase->status) {
            $purchase->update(['status' => $status]);
        }
    }
}
