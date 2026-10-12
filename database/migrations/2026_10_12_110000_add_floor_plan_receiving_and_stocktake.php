<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Three stock keeper features, one migration:
 *
 *  Floor plan   a hub's floor in metres, areas drawn on it, and which items
 *               sit in each area. Quantities stay in item_stocks; an area only
 *               says *where* an item is.
 *  Receiving    what actually arrived per shipment line / transfer (good,
 *               damaged), and a discrepancy row for every difference.
 *  Stocktake    a count of one location: expected (snapshot) vs counted per
 *               variant, posted as adjustments once someone else approves.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_locations', function (Blueprint $table): void {
            $table->decimal('floor_width_m', 7, 2)->nullable()->after('capacity_cbm');
            $table->decimal('floor_length_m', 7, 2)->nullable()->after('floor_width_m');
        });

        Schema::create('floor_areas', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->string('code', 20);
            $table->string('name')->nullable();
            $table->string('kind', 20)->default('storage');
            $table->decimal('x_m', 7, 2);
            $table->decimal('y_m', 7, 2);
            $table->decimal('width_m', 7, 2);
            $table->decimal('length_m', 7, 2);
            $table->string('notes', 500)->nullable();
            $table->timestamps();

            $table->unique(['stock_location_id', 'code']);
        });

        Schema::create('floor_area_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('floor_area_id')->constrained('floor_areas')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('placed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['floor_area_id', 'item_id']);
        });

        Schema::table('shipment_items', function (Blueprint $table): void {
            $table->integer('received_quantity')->nullable()->after('picked_quantity');
            $table->integer('damaged_quantity')->nullable()->after('received_quantity');
            $table->string('receipt_note', 500)->nullable()->after('damaged_quantity');
        });

        Schema::table('transfers', function (Blueprint $table): void {
            $table->integer('received_quantity')->nullable()->after('quantity');
            $table->integer('damaged_quantity')->nullable()->after('received_quantity');
        });

        Schema::create('receipt_discrepancies', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            // A Shipment or a Transfer.
            $table->morphs('receivable');
            $table->foreignId('item_variant_id')->constrained('item_variants');
            $table->foreignId('stock_location_id')->constrained('stock_locations');
            $table->foreignId('courier_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('kind', 12); // short | damaged | over
            $table->integer('expected');
            $table->integer('received');
            $table->integer('quantity'); // the difference this row is about
            $table->string('note', 500)->nullable();
            $table->string('status', 12)->default('open'); // open | resolved
            $table->string('resolution', 12)->nullable(); // found | lost | written_off | accepted
            $table->string('resolution_note', 500)->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('resolved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('resolved_at')->nullable();
            $table->timestamps();

            $table->index(['status', 'stock_location_id']);
        });

        Schema::create('stocktakes', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 30)->unique();
            $table->foreignId('stock_location_id')->constrained('stock_locations');
            $table->string('status', 12)->default('counting'); // counting | submitted | posted | voided
            $table->string('note', 500)->nullable();
            $table->foreignId('started_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('posted_at')->nullable();
            $table->timestamp('voided_at')->nullable();
            $table->timestamps();

            $table->index(['stock_location_id', 'status']);
        });

        Schema::create('stocktake_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stocktake_id')->constrained('stocktakes')->cascadeOnDelete();
            $table->foreignId('item_variant_id')->constrained('item_variants');
            // In the variant's own packaging unit, as item_stocks stores it.
            $table->integer('expected');
            $table->integer('counted')->nullable();
            $table->foreignId('counted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('counted_at')->nullable();
            $table->timestamps();

            $table->unique(['stocktake_id', 'item_variant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stocktake_lines');
        Schema::dropIfExists('stocktakes');
        Schema::dropIfExists('receipt_discrepancies');

        Schema::table('transfers', function (Blueprint $table): void {
            $table->dropColumn(['received_quantity', 'damaged_quantity']);
        });

        Schema::table('shipment_items', function (Blueprint $table): void {
            $table->dropColumn(['received_quantity', 'damaged_quantity', 'receipt_note']);
        });

        Schema::dropIfExists('floor_area_items');
        Schema::dropIfExists('floor_areas');

        Schema::table('stock_locations', function (Blueprint $table): void {
            $table->dropColumn(['floor_width_m', 'floor_length_m']);
        });
    }
};
