<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->cascadeOnDelete();
            $table->foreignId('item_variant_id')->constrained('item_variants')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('stock')->default(0);
            $table->decimal('price', 12, 2)->default(0);
            $table->enum('status', ['active', 'inactive'])->default('inactive');
            $table->timestamps();

            // One record per variant per store
            $table->unique(['item_variant_id', 'store_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('store_variants');
    }
};
