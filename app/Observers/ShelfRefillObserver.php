<?php

declare(strict_types=1);

namespace App\Observers;

use App\Models\Inventory\RefillRequest;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\ItemVariant;
use App\Services\Inventory\RefillEngine;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Raises a shelf refill the moment a bin drops to its refill line — a sale
 * picked off the shelf, a recount, anything that moves an item_stocks row on a
 * Store Shelf.
 *
 * Only shelf rows for items with a bin there are looked at. RefillEngine does
 * the rest, and asks only for what is not already on its way, so being called
 * twice for one change costs a query, not a duplicate request.
 *
 * Runs after commit and never throws into the write that triggered it.
 */
class ShelfRefillObserver
{
    public bool $afterCommit = true;

    public function __construct(private readonly RefillEngine $engine)
    {
    }

    public function created(Model $stock): void
    {
        $this->review($stock);
    }

    public function updated(Model $stock): void
    {
        if ($stock->wasChanged('quantity')) {
            $this->review($stock);
        }
    }

    private function review(Model $stock): void
    {
        if (! config('inventory.shelf_refill.observe_stock_changes', true)) {
            return;
        }

        $locationId = (int) ($stock->getAttribute('stock_location_id') ?? 0);
        $variantId = (int) ($stock->getAttribute('item_variant_id') ?? 0);

        if ($locationId === 0 || $variantId === 0) {
            return;
        }

        try {
            $shelf = StockLocation::query()->find($locationId);

            // Store Shelves, and Remote Hubs with their own lines.
            if ($shelf === null || ! in_array($shelf->kind, [StockLocation::KIND_SHELF, StockLocation::KIND_REMOTE_HUB], true)) {
                return;
            }

            $item = ItemVariant::query()->find($variantId)?->item;

            if ($item === null
                || ! ShelfItemBand::query()->where('stock_location_id', $shelf->id)->where('item_id', $item->id)->exists()) {
                return;
            }

            $this->engine->raise($shelf, $item, RefillRequest::ORIGIN_AUTO);
        } catch (Throwable $e) {
            Log::warning('Automatic shelf refill failed after a stock change', [
                'stock_location_id' => $locationId,
                'item_variant_id' => $variantId,
                'exception' => $e->getMessage(),
            ]);
        }
    }
}
