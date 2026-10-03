<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One tree for every place stock can sit (STOCK_PLAN.md §2.1).
 *
 * Today a place is one of three things — a `stores` row, a `warehouses` row or
 * an `item_inventory_locations` row — and item_stocks addresses them through a
 * morph. This table replaces all three with a single, Odoo-style location
 * tree:
 *
 *   main_hub    shared by every store; stockable
 *   store       group node for one retail store; NOT stockable — its total is
 *               the sum of its children
 *     shelf     what customers can reach; stockable
 *     backroom  the store's own stock room; stockable
 *     remote_hub optional, 0 or 1 per store; stockable
 *
 * Phase 1 is additive: nothing reads this table yet. legacy_type/legacy_id
 * record which old row a node was built from, so the phase-2 leaf conversion
 * and the phase-4 foreign-key re-pointing can map old morph addresses onto
 * nodes without matching on names. They are dropped with the old tables in
 * phase 5.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_locations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('parent_id')->nullable()->constrained('stock_locations')->cascadeOnDelete();
            $table->string('kind', 32);
            $table->string('name');
            $table->string('code')->unique();
            $table->string('address')->nullable();
            $table->string('status', 16)->default('active');
            $table->foreignId('store_id')->nullable()->constrained('stores')->cascadeOnDelete();
            $table->boolean('is_stockable')->default(true);

            $table->string('legacy_type')->nullable();
            $table->unsignedBigInteger('legacy_id')->nullable();

            $table->timestamps();

            $table->index(['kind', 'store_id']);
            $table->unique(['legacy_type', 'legacy_id'], 'stock_locations_legacy_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_locations');
    }
};
