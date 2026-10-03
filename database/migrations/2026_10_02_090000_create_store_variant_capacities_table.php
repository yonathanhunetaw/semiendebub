<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Min/max holding for one variant at one place.
 *
 * Capacity is a property of the pair (variant, location), not of either alone:
 * the same carton of water wants 6 on the shop floor, 60 in the back room and
 * 600 at the hub. `store_variants` already names the variant-in-a-store, and
 * `item_stocks` already keys quantities on a polymorphic location, so this
 * table joins the two vocabularies and adds the two numbers.
 *
 * The location morph accepts every level the hierarchy has:
 *
 *   App\Models\StockKeeper\ItemInventoryLocation  a shelf or a back room
 *   App\Models\Inventory\Warehouse               a store's remote warehouse
 *   App\Models\Store\Store                       a facility as a whole —
 *                                                retail outlet, remote
 *                                                warehouse or main warehouse,
 *                                                per stores.type
 *
 * Capacity is opt-in. A location with no row here is not monitored, which is
 * what keeps the replenishment planner from proposing a transfer for every
 * back room that has never had a positional stock row written for it.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('store_variant_capacities')) {
            return;
        }

        Schema::create('store_variant_capacities', function (Blueprint $table): void {
            $table->id();

            $table->foreignId('store_variant_id')
                ->constrained('store_variants')
                ->cascadeOnDelete();

            // Denormalised from store_variants so the planner can read a
            // capacity row and the matching item_stocks row without a join.
            $table->foreignId('item_variant_id')
                ->constrained('item_variants')
                ->cascadeOnDelete();

            // location_type + location_id, the same pair item_stocks uses.
            $table->morphs('location');

            $table->unsignedInteger('min_capacity')->default(0);
            $table->unsignedInteger('max_capacity')->default(0);

            $table->foreignId('set_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            // One ceiling per variant per place.
            $table->unique(
                ['store_variant_id', 'location_type', 'location_id'],
                'variant_location_capacity_unique',
            );

            // The planner's sweep: every monitored location, variant-first.
            $table->index(['item_variant_id', 'location_type', 'location_id'], 'capacity_variant_location_index');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_variant_capacities');
    }
};
