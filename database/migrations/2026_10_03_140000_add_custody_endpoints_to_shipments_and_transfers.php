<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Shipments and transfers name real locations, and a courier carries both
 * (STOCK_PLAN.md phase 4).
 *
 * shipments
 *   origin_stock_location_id       a Main Hub (A or B)
 *   destination_stock_location_id  a store's floor or a Remote Hub
 *   origin_store_id / destination_store_id become nullable: they still say
 *   which store a run belongs to, but Hubs A and B are not stores.
 *
 * transfers
 *   courier_id   the delivery user carrying a transfer between two sites. The
 *                origin hands the goods to them, and they hand them to the
 *                destination; while they hold it the stock sits at the
 *                "In Delivery" custody location.
 *
 * Backfill resolves each shipment's old store ends to their leaves the same
 * way StockScope::leafFor() does: a hub facility to its hub, a retail store to
 * its floor.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table): void {
            if (! Schema::hasColumn('shipments', 'origin_stock_location_id')) {
                $table->foreignId('origin_stock_location_id')->nullable()->after('destination_store_id')
                    ->constrained('stock_locations')->nullOnDelete();
                $table->foreignId('destination_stock_location_id')->nullable()->after('origin_stock_location_id')
                    ->constrained('stock_locations')->nullOnDelete();
            }
        });

        Schema::table('shipments', function (Blueprint $table): void {
            $table->foreignId('origin_store_id')->nullable()->change();
            $table->foreignId('destination_store_id')->nullable()->change();
        });

        Schema::table('transfers', function (Blueprint $table): void {
            if (! Schema::hasColumn('transfers', 'courier_id')) {
                $table->foreignId('courier_id')->nullable()->after('initiated_by')
                    ->constrained('users')->nullOnDelete();
            }
        });

        foreach (DB::table('shipments')->whereNull('origin_stock_location_id')->get(['id', 'origin_store_id', 'destination_store_id']) as $shipment) {
            DB::table('shipments')->where('id', $shipment->id)->update([
                'origin_stock_location_id' => $this->leafForStore($shipment->origin_store_id),
                'destination_stock_location_id' => $this->leafForStore($shipment->destination_store_id),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('transfers', function (Blueprint $table): void {
            $table->dropForeign(['courier_id']);
            $table->dropColumn('courier_id');
        });

        Schema::table('shipments', function (Blueprint $table): void {
            $table->dropForeign(['origin_stock_location_id']);
            $table->dropForeign(['destination_stock_location_id']);
            $table->dropColumn(['origin_stock_location_id', 'destination_stock_location_id']);
        });
    }

    private function leafForStore(?int $storeId): ?int
    {
        if ($storeId === null) {
            return null;
        }

        $node = DB::table('stock_locations')
            ->where('legacy_type', 'App\\Models\\Store\\Store')
            ->where('legacy_id', $storeId)
            ->first(['id', 'kind']);

        if ($node === null) {
            return null;
        }

        if ($node->kind !== 'store') {
            return (int) $node->id;
        }

        $floor = DB::table('stock_locations')->where('parent_id', $node->id)->where('kind', 'backroom')->value('id');

        return $floor === null ? null : (int) $floor;
    }
};
