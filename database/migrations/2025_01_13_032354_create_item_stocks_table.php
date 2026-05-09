<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('item_stocks', function (Blueprint $table) {
            $table->id();

            // 1. Link to the specific SKU (The Variant)
            // We use item_variant_id so stock can exist in warehouses OR stores
            $table->foreignId('item_variant_id')
                ->constrained()
                ->cascadeOnDelete();

            // 2. The Polymorphic Location
            // This creates 'location_id' (bigint) and 'location_type' (string)
            // It allows stock to belong to either a 'Warehouse' or a 'Store'
            $table->morphs('location');

            // 3. Inventory Data
            $table->integer('quantity')->default(0);
            $table->integer('min_stock_level')->default(5); // Alert threshold

            $table->timestamps();

            // 4. Safety: Ensure one variant only has ONE stock row per location
            $table->unique(['item_variant_id', 'location_id', 'location_type'], 'variant_location_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('item_stocks');
    }
};
