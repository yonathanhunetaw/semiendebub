<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_variant_packaging_quantity', function (Blueprint $table) {
            $table->id();
            // This links to the specific variant
            $table->foreignId('item_variant_id')->constrained('item_variants')->onDelete('cascade');
            // This links to the packaging type (e.g., Piece, Box, Carton)
            $table->foreignId('item_packaging_type_id')->constrained('item_packaging_types')->onDelete('cascade');
            
            // These are the only two details we need here
            $table->integer('quantity');
            $table->decimal('cbm', 8, 4);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_variant_packaging_quantity');
    }
};