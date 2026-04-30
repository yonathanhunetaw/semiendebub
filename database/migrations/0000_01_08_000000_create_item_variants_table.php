<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('item_variants', function (Blueprint $table) {
            $table->id();

            // Identity
            $table->string('sku')->unique()->nullable();
            $table->string('barcode')->nullable()->unique();

            // Relationships
            $table->foreignId('item_id')->constrained()->onDelete('cascade');
            $table->foreignId('item_color_id')->nullable()->constrained()->onDelete('set null');
            $table->foreignId('item_size_id')->nullable()->constrained()->onDelete('set null');
            $table->foreignId('item_packaging_type_id')->nullable()->constrained()->onDelete('set null');
            $table->foreignId('owner_id')->nullable()->constrained('users');

            // Physical Specs
            $table->integer('packaging_total_pieces')->default(1);
            $table->json('images')->nullable();

            // Status (Unified)
            $table->enum('status', ['active', 'inactive', 'unavailable', 'out_of_stock'])->default('inactive');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_variants');
    }
};
