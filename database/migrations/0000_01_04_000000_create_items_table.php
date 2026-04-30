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
        Schema::create('items', function (Blueprint $table) {

            // All properties should have images, price, stock
            $table->id();

            // General Metadata
            $table->json('general_images')->nullable(); // High-level marketing photos

            // Core Identity (Shared by all variants)
            $table->string('product_name');
            $table->text('product_description')->nullable();
            $table->text('packaging_details')->nullable(); // General info like "Boxed" or "Fragile"

            // Categorization
            // Use a foreign key instead of JSON for better performance
            $table->foreignId('item_category_id')->nullable()->constrained()->onDelete('set null');

            // Status & Logic
            $table->enum('status', ['draft', 'active', 'inactive', 'archived'])->default('draft');
            $table->boolean('is_incomplete')->default(true);

            $table->timestamps();

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        // 1. (Optional but safer) Disable foreign key constraints so
        // the drop doesn't fail if other tables are pointing here.
        Schema::disableForeignKeyConstraints();

        // 2. Only drop the table this migration is responsible for.
        Schema::dropIfExists('items');

        Schema::enableForeignKeyConstraints();
    }
};
