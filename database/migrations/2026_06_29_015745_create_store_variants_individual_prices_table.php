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
        Schema::create('store_variants_individual_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_variant_id')->constrained('store_variants')->cascadeOnDelete();
            
            $table->json('pricing_matrix')->nullable(); // 🎯 Self-contained individual tier prices
            $table->boolean('active')->default(true);
            $table->timestamps();

            // An individual price might just be one per store variant, or maybe linked to a specific type?
            // If it's just the default individual price, one per variant is enough.
            $table->unique('store_variant_id', 'store_variant_ind_unique');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('store_variants_individual_prices');
    }
};
