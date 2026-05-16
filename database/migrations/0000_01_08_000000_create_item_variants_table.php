<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('item_variants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('item_id')->constrained()->onDelete('cascade');
            
            // Core Identity (Saying it in one place)
            $table->string('sku')->unique()->nullable();
            $table->string('barcode')->nullable()->unique();
            $table->foreignId('item_color_id')->nullable()->constrained()->onDelete('set null');
            $table->foreignId('item_size_id')->nullable()->constrained()->onDelete('set null');
            // Keep this strictly for universal identity tags that never change regardless of how the product is packaged
                    // $table->foreignId('item_packaging_type_id')->constrained('item_packaging_types')->onDelete('cascade');
            $table->foreignId('owner_id')->nullable()->constrained('users');

            $table->enum('status', ['active', 'inactive', 'unavailable', 'out_of_stock'])->default('inactive');
            $table->timestamps();
            $table->softDeletes();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_variants');
    }
};
