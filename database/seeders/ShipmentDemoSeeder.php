<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Services\Inventory\StockScope;
use App\Services\ShipmentWorkflowService;
use App\Services\StockService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Demo shipments covering every filter chip on the shipment screens.
 *
 * Every run follows the real rule (STOCK_PLAN.md phase 4): it leaves a Main
 * Hub and lands at the seller's store — its floor, or its Remote Hub when it
 * has one. Statuses are written directly to skip the agreement gate, but the
 * goods are kept honest: a run parked at dispatched, in transit or delivered
 * has its load in Delivery's custody, and a received run has landed. Seeding
 * a stage the ledger could never reach would leave runs nobody can finish.
 *
 *     php artisan db:seed --class=ShipmentDemoSeeder
 *
 * Re-running replaces the previous demo set (matched on the SHP-DEMO prefix),
 * returning any of its goods still in a courier's hands to the hub first.
 */
class ShipmentDemoSeeder extends Seeder
{
    public function run(): void
    {
        $stores = Store::query()->retail()->orderBy('id')->get();
        $hubs = StockLocation::query()->ofKind(StockLocation::KIND_MAIN_HUB)->orderBy('id')->get();

        if ($stores->isEmpty() || $hubs->isEmpty()) {
            $this->command->warn('Need a retail store and a Main Hub to seed shipments.');

            return;
        }

        // Everything is routed through the store sellers actually belong to, so
        // the seeded rows show up on their screens.
        // Look users up by their assigned role, not the `role` column. The
        // column was NULL on eight seeded accounts, so a column lookup could pick
        // nobody and leave the demo rows with no creator, courier or keeper on
        // their agreement ledger — a gate that could never be read back.
        $home = User::role('seller')->whereNotNull('store_id')->first()?->store;
        $home = $home !== null && $home->type === Store::TYPE_RETAIL ? $home : $stores->first();

        $scope = app(StockScope::class);
        $floor = $scope->leafFor(Store::class, (int) $home->id);
        $remote = StockLocation::query()->where('store_id', $home->id)->ofKind(StockLocation::KIND_REMOTE_HUB)->first();
        $courier = User::role('delivery')->first();

        $this->clearPreviousDemoSet();

        // status, direction, hours offset from now, assign a courier?
        $specs = [
            // Inside the 4-party gate: partially agreed, not yet schedulable
            [ShipmentWorkflowService::PENDING_AGREEMENT, 'inbound', 8, false],
            [ShipmentWorkflowService::PENDING_AGREEMENT, 'outbound', 20, false],

            // Seller chip: "Scheduled"
            [ShipmentWorkflowService::SCHEDULED, 'inbound', 6, false],
            [ShipmentWorkflowService::SCHEDULED, 'outbound', 30, false],

            // "Pending Manifest" — draft / picking / ready all read as pending
            [ShipmentWorkflowService::DRAFT, 'inbound', 10, false],
            [ShipmentWorkflowService::PICKING, 'outbound', 4, false],
            [ShipmentWorkflowService::READY, 'inbound', 2, false],

            // "En Route"
            [ShipmentWorkflowService::IN_TRANSIT, 'inbound', -1, true],
            [ShipmentWorkflowService::IN_TRANSIT, 'outbound', -2, true],

            // "Shipped"
            [ShipmentWorkflowService::DELIVERED, 'inbound', -5, true],
            [ShipmentWorkflowService::RECEIVED, 'outbound', -28, true],

            // "Overdue" — still pre-dispatch with a scheduled slot in the past
            [ShipmentWorkflowService::SCHEDULED, 'inbound', -3, false],
            [ShipmentWorkflowService::DRAFT, 'outbound', -9, false],

            // Unclaimed dispatched load, so the courier pool is not empty
            [ShipmentWorkflowService::DISPATCHED, 'inbound', -1, false],
            [ShipmentWorkflowService::DISPATCHED, 'outbound', 1, true],
        ];

        $vehicles = [
            ['Isuzu NPR Box Truck', 'ET-3-9482', 14.5, 'BAY #04'],
            ['Suzuki Carry Mini Van', 'ET-2-1104', 5.6, 'BAY #02'],
            ['Mitsubishi Canter', 'ET-3-7741', 11.0, 'BAY #01'],
        ];

        $created = 0;

        foreach ($specs as $index => [$status, $direction, $hours, $withCourier]) {
            // "inbound" lands on the store floor, "outbound" at its Remote Hub
            // (or the floor when it has none). Both leave a Main Hub.
            $origin = $hubs[$index % $hubs->count()];
            $destination = $direction === 'outbound' && $remote !== null ? $remote : $floor;

            [$vName, $vPlate, $vCbm, $vSlot] = $vehicles[$index % count($vehicles)];
            $moment = now()->addHours($hours);

            $shipment = Shipment::create([
                'reference' => 'SHP-DEMO-' . str_pad((string) ($index + 1), 3, '0', STR_PAD_LEFT),
                'origin_store_id' => $origin->legacy_type === Store::class ? (int) $origin->legacy_id : null,
                'destination_store_id' => $home->id,
                'origin_stock_location_id' => $origin->id,
                'destination_stock_location_id' => $destination->id,
                'status' => $status,
                'vehicle_name' => $vName,
                'vehicle_plate' => $vPlate,
                'vehicle_max_cbm' => $vCbm,
                'slot' => $vSlot,
                'distance_km' => round(8 + ($index * 1.7), 1),
                'scheduled_for' => $moment,
                'courier_id' => $withCourier ? $courier?->id : null,
                'gate_pass' => 'GP-' . random_int(10000, 99999),
                'eta' => $moment->copy()->addMinutes(random_int(25, 90)),
                'notes' => 'Seeded demo shipment for UI review.',
                'created_by' => User::role('admin')->value('users.id'),
                // Timestamps consistent with the status the row is parked at.
                'picked_at' => $this->reached($status, ShipmentWorkflowService::PICKING) ? $moment->copy()->subMinutes(90) : null,
                'dispatched_at' => $this->reached($status, ShipmentWorkflowService::DISPATCHED) ? $moment->copy()->subMinutes(60) : null,
                'in_transit_at' => $this->reached($status, ShipmentWorkflowService::IN_TRANSIT) ? $moment->copy()->subMinutes(45) : null,
                'delivered_at' => $this->reached($status, ShipmentWorkflowService::DELIVERED) ? $moment->copy()->subMinutes(10) : null,
                'received_at' => $status === ShipmentWorkflowService::RECEIVED ? $moment->copy()->subMinutes(5) : null,
            ]);

            $this->attachAgreements($shipment, $status, $moment);
            $this->attachManifest($shipment, $origin);
            $this->settleCustody($shipment, $status, $origin, $destination);
            $created++;
        }

        $this->command->info("Seeded {$created} demo shipments.");
    }

    /**
     * Give each row an agreement ledger consistent with its stage.
     *
     * Anything at `scheduled` or beyond must, by definition, have cleared the
     * consensus gate — so all four parties are accepted on the agreed slot.
     * Rows parked inside the gate show a realistic partial state.
     */
    private function attachAgreements(Shipment $shipment, string $status, \Illuminate\Support\Carbon $moment): void
    {
        $primary = $moment->copy()->format('Y-m-d\TH:i');
        $altOne = $moment->copy()->addHours(6)->format('Y-m-d\TH:i');
        $altTwo = $moment->copy()->addDay()->format('Y-m-d\TH:i');

        $creator = User::role('admin')->value('users.id');
        $courier = User::role('delivery')->value('users.id');
        $keeper = User::role('stock_keeper')->value('users.id');

        $tick = fn (string $key, ?int $actor, string $slot) => [
            'status' => ShipmentWorkflowService::AGREEMENT_ACCEPTED,
            'slot' => $slot,
            'at' => now()->toIso8601String(),
            $key => $actor,
        ];

        $pending = fn (string $key) => [
            'status' => ShipmentWorkflowService::AGREEMENT_PENDING,
            'slot' => null,
            'at' => null,
            $key => null,
        ];

        if ($status === ShipmentWorkflowService::PENDING_AGREEMENT) {
            // Creator ticked, fleet agreed, origin proposed a different window,
            // destination silent — the gate visibly holding.
            $agreements = [
                'creator' => $tick('user_id', $creator, $primary),
                'fleet' => $tick('courier_id', $courier, $primary),
                'origin' => [
                    'status' => ShipmentWorkflowService::AGREEMENT_RESCHEDULED,
                    'slot' => $altOne,
                    'at' => now()->toIso8601String(),
                    'stock_keeper_id' => $keeper,
                ],
                'destination' => $pending('receiver_id'),
            ];
        } else {
            $agreements = [
                'creator' => $tick('user_id', $creator, $primary),
                'fleet' => $tick('courier_id', $courier, $primary),
                'origin' => $tick('stock_keeper_id', $keeper, $primary),
                'destination' => $tick('receiver_id', $keeper, $primary),
            ];
        }

        $shipment->update([
            'schedule_options' => [$primary, $altOne, $altTwo],
            'party_agreements' => $agreements,
            'agreed_scheduled_for' => $status === ShipmentWorkflowService::PENDING_AGREEMENT ? null : $primary,
        ]);
    }

    /**
     * Put 2–4 real SKUs on the manifest, preferring variants that actually have
     * stock at the origin so the coverage badges read realistically.
     */
    private function attachManifest(Shipment $shipment, StockLocation $origin): void
    {
        $variantIds = ItemStock::query()
            ->where('stock_location_id', $origin->id)
            ->where('quantity', '>', 30)
            ->inRandomOrder()
            ->limit(random_int(2, 4))
            ->pluck('item_variant_id')
            ->unique();

        if ($variantIds->isEmpty()) {
            $variantIds = \App\Models\Item\ItemVariant::query()
                ->inRandomOrder()
                ->limit(2)
                ->pluck('id');
        }

        $units = ['Ctns', 'Bx', 'Pcs'];
        $aisles = ['Aisle A-04 | Shelf 2', 'Aisle B-08 | Shelf 1', 'Aisle C-02 | Rack 5', 'Aisle D-01 | Bulk Floor'];

        foreach ($variantIds->values() as $i => $variantId) {
            // Never more than the hub holds, so a run past dispatch can carry it.
            $held = (int) ItemStock::query()->where('stock_location_id', $origin->id)->where('item_variant_id', $variantId)->value('quantity');
            $quantity = max(1, min(random_int(10, 60), $held > 0 ? intdiv($held, 4) : 10));

            $shipment->items()->create([
                'item_variant_id' => $variantId,
                'quantity' => $quantity,
                // A picked figure only makes sense once picking has begun.
                'picked_quantity' => $this->reached((string) $shipment->status, ShipmentWorkflowService::PICKING)
                    ? max(0, $quantity - random_int(0, 4))
                    : 0,
                'cbm' => round($quantity * 0.045, 3),
                'weight_kg' => round($quantity * 12, 2),
                'unit' => $units[$i % count($units)],
                'location' => $aisles[$i % count($aisles)],
            ]);
        }
    }

    /**
     * Put the load where its status says it is: in Delivery's custody once
     * dispatched, at the destination once received. Through the ledger
     * gateway, so the journal records it like any other run.
     */
    private function settleCustody(Shipment $shipment, string $status, StockLocation $origin, StockLocation $destination): void
    {
        if (! $this->reached($status, ShipmentWorkflowService::DISPATCHED)) {
            return;
        }

        $ledger = app(StockService::class);
        $courierId = $shipment->courier_id !== null ? (int) $shipment->courier_id : null;

        foreach ($shipment->items()->get() as $item) {
            $moving = $item->picked_quantity > 0 ? (int) $item->picked_quantity : (int) $item->quantity;
            $context = ['reason' => 'Shipment '.$shipment->reference.' (demo)', 'reference' => $shipment];

            try {
                $ledger->handToCourier((int) $item->item_variant_id, $origin, $moving, $courierId, $context);
            } catch (\App\Exceptions\InsufficientStockException) {
                // The hub cannot cover it: leave the line off the load rather
                // than seed stock that does not exist.
                $item->delete();

                continue;
            }

            if ($status === ShipmentWorkflowService::RECEIVED) {
                $ledger->handOverFromCourier((int) $item->item_variant_id, $destination, $moving, $courierId, $context);
            }
        }
    }

    /**
     * Has a shipment at $status already passed through $stage?
     */
    private function reached(string $status, string $stage): bool
    {
        $order = [
            ShipmentWorkflowService::DRAFT => 0,
            ShipmentWorkflowService::SCHEDULED => 1,
            ShipmentWorkflowService::PICKING => 2,
            ShipmentWorkflowService::READY => 3,
            ShipmentWorkflowService::DISPATCHED => 4,
            ShipmentWorkflowService::IN_TRANSIT => 5,
            ShipmentWorkflowService::DELIVERED => 6,
            ShipmentWorkflowService::RECEIVED => 7,
        ];

        return ($order[$status] ?? 0) >= ($order[$stage] ?? 0);
    }

    private function clearPreviousDemoSet(): void
    {
        $ids = Shipment::query()->where('reference', 'LIKE', 'SHP-DEMO-%')->pluck('id');

        if ($ids->isEmpty()) {
            return;
        }

        // Goods a previous demo run still has in a courier's hands go back to
        // its hub, so deleting the run cannot strand them in custody.
        $ledger = app(StockService::class);

        $inCustody = Shipment::query()->whereIn('id', $ids)
            ->whereIn('status', [ShipmentWorkflowService::DISPATCHED, ShipmentWorkflowService::IN_TRANSIT, ShipmentWorkflowService::DELIVERED])
            ->whereNotNull('origin_stock_location_id')
            ->with('items')
            ->get();

        foreach ($inCustody as $shipment) {
            foreach ($shipment->items as $item) {
                $moving = $item->picked_quantity > 0 ? (int) $item->picked_quantity : (int) $item->quantity;

                try {
                    $ledger->returnFromCourier((int) $item->item_variant_id, (int) $shipment->origin_stock_location_id, $moving, null, [
                        'reason' => 'Demo shipment cleared',
                        'reference' => $shipment,
                    ]);
                } catch (\App\Exceptions\InsufficientStockException) {
                    // Seeded before custody existed: nothing is in custody for it.
                }
            }
        }

        DB::table('shipment_items')->whereIn('shipment_id', $ids)->delete();
        Shipment::query()->whereIn('id', $ids)->delete();
    }
}
