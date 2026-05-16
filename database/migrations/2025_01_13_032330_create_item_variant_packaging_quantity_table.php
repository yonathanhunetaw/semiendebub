<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void

    {
        Schema::create('item_variant_packaging_quantity', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_variant_id')->constrained('item_variants')->onDelete('cascade');
            $table->foreignId('item_packaging_type_id')->constrained('item_packaging_types')->onDelete('cascade');
            
            // Logistics specs for this specific packaging tier
            $table->integer('quantity');                   // e.g., 1 for Piece, 12 for Box, 120 for Carton
            $table->decimal('cbm', 8, 4)->default(0.0000); // The unique volume of this specific packaging layer
            
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
