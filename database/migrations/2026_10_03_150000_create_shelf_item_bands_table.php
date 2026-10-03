<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * An item's bin on a Store Shelf: how full it should be.
 *
 * One item per bin, across all of its pack variants (a Bic pen sold by the
 * packet and by the piece shares one bin). The band is set in one of the
 * item's own pack units — "max 50 Packets, refill at 10, critical at 10" — so
 * it reads the way the floor counts. The shelf matrix compares the item's shelf
 * stock, converted to pieces, against these lines.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shelf_item_bands', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            // The pack unit the lines are counted in; null = the item's smallest.
            $table->foreignId('item_packaging_type_id')->nullable()->constrained('item_packaging_types')->nullOnDelete();
            $table->unsignedInteger('max_units');
            $table->unsignedInteger('refill_units');
            $table->unsignedInteger('critical_units');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['stock_location_id', 'item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shelf_item_bands');
    }
};
