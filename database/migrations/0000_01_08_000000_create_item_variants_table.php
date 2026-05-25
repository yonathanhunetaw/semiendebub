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
            $table->foreignId('item_color_id')->nullable()->constrained()->onDelete('cascade');
            $table->foreignId('item_size_id')->nullable()->constrained()->onDelete('cascade');

            // ─── CRITICAL: Ensure this column is physically built by MySQL ───────
            $table->json('images')->nullable();
            $table->foreignId('item_packaging_type_id')->nullable()->constrained()->onDelete('cascade');

            $table->string('sku')->nullable()->unique();
            $table->string('barcode')->nullable();
            $table->string('status')->default('active');
            $table->foreignId('owner_id')->nullable()->constrained('users')->onDelete('set null');
            $table->softDeletes();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_variants');
    }
};
