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
        Schema::create('store_variants_seller_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_variant_id')->constrained('store_variants')->cascadeOnDelete();
            $table->foreignId('seller_id')->constrained('users')->cascadeOnDelete();

            $table->json('pricing_matrix')->nullable(); // 🎯 Self-contained seller/agent wholesale tiers
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->unique(['store_variant_id', 'seller_id'], 'store_variant_seller_unique');
            $table->index(['seller_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('store_variants_seller_prices');
    }
};
