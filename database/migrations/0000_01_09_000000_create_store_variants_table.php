<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('store_variants', function (Blueprint $table) {
            $table->id();

            $table->foreignId('item_variant_id')
                ->constrained('item_variants')
                ->cascadeOnDelete();

            $table->foreignId('store_id')
                ->constrained()
                ->cascadeOnDelete();

            // Inventory
            $table->unsignedInteger('stock')->default(0);

            // Pricing
            $table->decimal('price', 12, 2)->default(0);
            $table->decimal('discount_price', 12, 2)->nullable();
            $table->timestamp('discount_ends_at')->nullable();

            // Availability system (your advanced design)
            $table->boolean('active')->default(true);
            $table->enum('manual_status', ['auto', 'forced'])->default('auto');
            $table->enum('forced_status', ['active', 'inactive'])->nullable();

            $table->timestamps();

            $table->unique(['item_variant_id', 'store_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_variants');
    }
};
