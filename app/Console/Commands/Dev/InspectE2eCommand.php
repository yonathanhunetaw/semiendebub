<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use Illuminate\Console\Command;

/**
 * Read-only answers for the Playwright specs about what the screens do not show
 * exactly: stock per location from the ledger, an order's stage, payments and
 * holds, and a transfer's state. Prints JSON.
 *
 *   php artisan e2e:inspect stock 29          every location holding variant 29
 *   php artisan e2e:inspect item 9            pieces of item 9 (every variant, cartons opened up)
 *   php artisan e2e:inspect sale SALE-…       stage, payments and stock holds
 *   php artisan e2e:inspect transfer TRF-…    status, counts, times
 *   php artisan e2e:inspect shipment SHP-…    status, and each line's quantity and what is picked
 *   php artisan e2e:inspect store 'Name'      a store's id and the stock locations it got
 *   php artisan e2e:inspect site 12           store 12's site: its QR codes (what a phone camera
 *                                             reads off the counter), key holder, today's status
 *   php artisan e2e:inspect site-at 3         the same for stock location 3 (a main hub, a remote hub)
 *
 * Like e2e:prepare it refuses any database not named *_e2e.
 */
final class InspectE2eCommand extends Command
{
    /** @var string */
    protected $signature = 'e2e:inspect {what : stock, item, sale, transfer, shipment, store, site or site-at} {key : a variant id or a reference}';

    /** @var string */
    protected $description = 'Print ledger facts from the *_e2e database for the Playwright specs';

    public function handle(): int
    {
        $database = (string) config('database.connections.'.config('database.default').'.database');

        if (! str_ends_with($database, '_e2e') || app()->environment('production')) {
            $this->components->error("Refusing to run against '{$database}': only a *_e2e database outside production.");

            return self::FAILURE;
        }

        $key = (string) $this->argument('key');

        $answer = match ((string) $this->argument('what')) {
            'stock' => $this->stock((int) $key),
            'item' => $this->pieces((int) $key),
            'sale' => $this->sale($key),
            'transfer' => $this->transfer($key),
            'shipment' => $this->shipment($key),
            'store' => $this->store($key),
            'site' => $this->site(StockLocation::query()->where('store_id', (int) $key)->where('kind', StockLocation::KIND_STORE)->first()),
            'site-at' => $this->site(StockLocation::query()->find((int) $key)),
            default => null,
        };

        if ($answer === null) {
            $this->components->error('Nothing found for that.');

            return self::FAILURE;
        }

        $this->line((string) json_encode($answer, JSON_UNESCAPED_SLASHES));

        return self::SUCCESS;
    }

    /** @return array<string, int> location id => units, every location that holds or held them */
    private function stock(int ...$variantIds): array
    {
        return ItemStock::query()
            ->whereIn('item_variant_id', $variantIds)
            ->whereNotNull('stock_location_id')
            ->groupBy('stock_location_id')
            ->selectRaw('stock_location_id, SUM(quantity) AS quantity')
            ->pluck('quantity', 'stock_location_id')
            ->mapWithKeys(fn ($quantity, $location): array => [(string) $location => (int) $quantity])
            ->all();
    }

    /**
     * Pieces of every variant of an item per location, the way the refill engine counts
     * them: a carton is its pieces.
     *
     * @return array<string, int>
     */
    private function pieces(int $itemId): array
    {
        $ladder = app(\App\Services\Inventory\PackagingLadder::class);

        return ItemStock::query()
            ->whereIn('item_variant_id', \App\Models\Item\ItemVariant::query()->where('item_id', $itemId)->pluck('id'))
            ->whereNotNull('stock_location_id')
            ->get(['stock_location_id', 'item_variant_id', 'quantity'])
            ->groupBy('stock_location_id')
            ->map(fn ($rows): int => (int) $rows->sum(fn ($row): int => (int) $row->quantity * $ladder->piecesPerUnit((int) $row->item_variant_id)))
            ->mapWithKeys(fn (int $pieces, $location): array => [(string) $location => $pieces])
            ->all();
    }

    /** @return array<string, mixed>|null */
    private function sale(string $reference): ?array
    {
        $sale = Sale::query()->with(['payments', 'items.storeVariant'])->where('reference_number', $reference)->first();

        if ($sale === null) {
            return null;
        }

        return [
            'stage' => (string) $sale->fulfillment_stage,
            'total' => (float) $sale->total_amount,
            'payments' => $sale->payments->map(fn ($p): array => [
                'method' => (string) $p->payment_method,
                'amount' => (float) $p->amount,
                'status' => (string) $p->status,
            ])->values()->all(),
            'lines' => $sale->items->map(fn ($i): array => [
                'variant' => (int) $i->storeVariant?->item_variant_id,
                'quantity' => (int) $i->quantity,
                'price' => (float) $i->unit_price,
            ])->values()->all(),
            'holds' => StockReservation::query()
                ->whereIn('sale_item_id', $sale->items->pluck('id'))
                ->get()
                ->map(fn (StockReservation $r): array => [
                    'variant' => (int) $r->item_variant_id,
                    'quantity' => (int) $r->quantity,
                    'status' => (string) $r->status,
                    'location' => $r->stock_location_id === null ? null : (int) $r->stock_location_id,
                ])->values()->all(),
        ];
    }

    /** @return array<string, mixed>|null a site, its QR paths and today */
    private function site(?StockLocation $site): ?array
    {
        if ($site === null) {
            return null;
        }

        $qr = app(\App\Services\Workforce\CounterQr::class);
        $day = app(\App\Services\Workforce\SiteDayService::class)->day($site, now());
        $key = app(\App\Services\Workforce\KeyCustodyService::class)->keyFor($site);

        return [
            'id' => (int) $site->id,
            'printed' => "/work/clock/{$site->id}/".$qr->printedToken($site),
            'live' => "/work/clock/{$site->id}/".$qr->liveToken($site),
            'key_holder' => $key->holder_id,
            'status' => $day->status,
            'clocked_in' => \App\Models\Workforce\TimeEntry::query()->open()->where('stock_location_id', $site->id)->pluck('user_id')->map(fn ($id): int => (int) $id)->all(),
        ];
    }

    private function store(string $name): ?array
    {
        $store = \App\Models\Store\Store::query()->where('name', $name)->first();

        return $store === null ? null : [
            'id' => (int) $store->id,
            'status' => (string) $store->status,
            'locations' => StockLocation::query()->where('store_id', $store->id)->pluck('kind')->map(fn ($kind): string => (string) $kind)->sort()->values()->all(),
        ];
    }

    /** @return array<string, mixed>|null */
    private function transfer(string $reference): ?array
    {
        $transfer = Transfer::query()->where('reference', $reference)->first();

        return $transfer === null ? null : [
            'status' => (string) $transfer->status,
            'quantity' => (int) $transfer->quantity,
            'received' => $transfer->received_quantity === null ? null : (int) $transfer->received_quantity,
            'handed_over' => $transfer->handed_over_at !== null,
            'source' => $transfer->source_location_id === null ? null : (int) $transfer->source_location_id,
            'destination' => $transfer->destination_location_id === null ? null : (int) $transfer->destination_location_id,
            'transit' => (int) StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->value('id'),
        ];
    }

    /** @return array<string, mixed>|null */
    private function shipment(string $reference): ?array
    {
        $shipment = \App\Models\Fulfillment\Shipment::query()->where('reference', $reference)->with('items')->first();

        return $shipment === null ? null : [
            'status' => (string) $shipment->status,
            'prepared' => $shipment->prepared_at !== null,
            'courier_started' => $shipment->courier_started_at !== null,
            'courier_checked' => $shipment->courier_checked_at !== null,
            'courier_signed' => $shipment->courier_signed_at !== null,
            'receiver_checked' => $shipment->receiver_checked_at !== null,
            'lines' => $shipment->items->map(fn ($line): array => [
                'variant' => (int) $line->item_variant_id,
                'quantity' => (int) $line->quantity,
                'picked' => (int) $line->picked_quantity,
                'received' => $line->received_quantity !== null ? (int) $line->received_quantity : null,
                'damaged' => $line->damaged_quantity !== null ? (int) $line->damaged_quantity : null,
            ])->values()->all(),
        ];
    }
}
