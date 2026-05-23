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
        Schema::create('item_variant_packaging_quantity', function (Blueprint $table) {
            $table->id();

            // Link to the specific variant
            $table->foreignId('item_variant_id')->constrained('item_variants')->onDelete('cascade');

            // Link to the packaging type (Piece, Box, Carton, etc.)
            $table->foreignId('item_packaging_type_id')->constrained('item_packaging_types')->onDelete('cascade');

            // Product-specific logistics specs
            $table->integer('quantity');                   // e.g., 12 units in a box
            $table->decimal('cbm', 10, 4)->default(0.0000); // Unique volume for this variant's packaging

            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('item_variant_packaging_quantity');
    }
};
