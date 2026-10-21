<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Receiving at the Main Hub and the item's cost (docs/plans/procurement-pipeline.md, PP5).
 *
 * Receiving books the goods into a hub at once; "finalise costs" comes later,
 * once every cost is confirmed, and writes each SKU's weighted-average cost
 * (owner, 2026-10-21). item_cost_entries keeps every change of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('consignments', function (Blueprint $table): void {
            $table->foreignId('received_location_id')->nullable()->after('stage_dates')->constrained('stock_locations')->nullOnDelete();
            // The stage the goods were received from: units counted short stay there.
            $table->string('received_from', 30)->nullable()->after('received_location_id');
            $table->timestamp('received_at')->nullable()->after('received_from');
            $table->foreignId('received_by')->nullable()->after('received_at')->constrained('users')->nullOnDelete();
            $table->timestamp('costs_finalised_at')->nullable()->after('received_by');
            $table->foreignId('costs_finalised_by')->nullable()->after('costs_finalised_at')->constrained('users')->nullOnDelete();
        });

        Schema::table('consignment_lines', function (Blueprint $table): void {
            // What arrived (damaged included), what of it was damaged.
            $table->unsignedInteger('received_quantity')->nullable()->after('goods_value_etb');
            $table->unsignedInteger('damaged_quantity')->nullable()->after('received_quantity');
            $table->string('receipt_note')->nullable()->after('damaged_quantity');
            // ETB for one good unit, written when the costs are finalised.
            $table->decimal('landed_unit_etb', 16, 4)->nullable()->after('receipt_note');
        });

        Schema::table('item_variants', function (Blueprint $table): void {
            // ETB for one unit of the variant's own packaging, weighted average.
            $table->decimal('unit_cost', 16, 4)->nullable();
            $table->timestamp('unit_cost_at')->nullable();
        });

        Schema::create('item_cost_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('item_variant_id')->constrained('item_variants')->cascadeOnDelete();
            $table->foreignId('consignment_line_id')->nullable()->constrained('consignment_lines')->nullOnDelete();
            // The batch: how many good units, at what landed cost each.
            $table->unsignedInteger('quantity');
            $table->decimal('batch_unit_cost', 16, 4);
            // What was on hand before it, at what cost, and the cost after.
            $table->integer('on_hand_before');
            $table->decimal('cost_before', 16, 4)->nullable();
            $table->decimal('cost_after', 16, 4);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_cost_entries');
        Schema::table('item_variants', function (Blueprint $table): void {
            $table->dropColumn(['unit_cost', 'unit_cost_at']);
        });
        Schema::table('consignment_lines', function (Blueprint $table): void {
            $table->dropColumn(['received_quantity', 'damaged_quantity', 'receipt_note', 'landed_unit_etb']);
        });
        Schema::table('consignments', function (Blueprint $table): void {
            $table->dropConstrainedForeignId('received_location_id');
            $table->dropConstrainedForeignId('received_by');
            $table->dropConstrainedForeignId('costs_finalised_by');
            $table->dropColumn(['received_from', 'received_at', 'costs_finalised_at']);
        });
    }
};
