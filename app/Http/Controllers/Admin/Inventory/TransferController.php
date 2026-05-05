<?php

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Models\Transfer;
use Inertia\Inertia;

class TransferController extends Controller
{
    public function index()
    {
        $transfers = Transfer::with([
            'fromLocation',
            'toLocation',
            'variant.item',
            'variant.itemColor',
            'variant.itemSize',
            'initiatedBy',
        ])
        ->latest()
        ->get()
        ->map(fn ($t) => [
            'id'             => $t->id,
            'reference'      => $t->reference,
            'from_location'  => $t->fromLocation->name,
            'to_location'    => $t->toLocation->name,
            'item_name'      => $t->variant->item->product_name,
            'variant_label'  => collect([
                $t->variant->itemColor?->name,
                $t->variant->itemSize?->name,
            ])->filter()->join(' / ') ?: 'Default',
            'sku'            => $t->variant->sku,
            'quantity'       => $t->quantity,
            'status'         => $t->status,
            'initiated_by'   => $t->initiatedBy
                ? trim("{$t->initiatedBy->first_name} {$t->initiatedBy->last_name}")
                : 'System',
            'created_at'     => $t->created_at->toISOString(),
            'completed_at'   => $t->completed_at?->toISOString(),
        ]);

        return Inertia::render('Admin/Inventory/Transfers/index', [
            'transfers'      => $transfers,
            'pendingCount'   => $transfers->where('status', 'pending')->count(),
            'inTransitCount' => $transfers->where('status', 'in_transit')->count(),
            'completedCount' => $transfers->where('status', 'completed')->count(),
        ]);
    }

    public function complete(Transfer $transfer)
    {
        $transfer->update([
            'status'       => 'completed',
            'completed_at' => now(),
        ]);

        // Adjust stock: deduct from source, add to destination
        $from = $transfer->fromLocation->stockLines()->where('item_variant_id', $transfer->item_variant_id)->first();
        $to   = $transfer->toLocation->stockLines()->firstOrCreate(
            ['item_variant_id' => $transfer->item_variant_id],
            ['quantity' => 0]
        );

        if ($from) {
            $from->decrement('quantity', $transfer->quantity);
        }
        $to->increment('quantity', $transfer->quantity);

        return back()->with('success', "Transfer {$transfer->reference} marked as completed.");
    }

    public function cancel(Transfer $transfer)
    {
        $transfer->update(['status' => 'cancelled']);

        return back()->with('success', "Transfer {$transfer->reference} cancelled.");
    }

    // Add create/store/show as needed
}
