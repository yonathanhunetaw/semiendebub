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
        Schema::table('item_variant_packaging_quantity', function (Blueprint $table) {
            // Adding the columns to match your Seeder's expected payload
            $table->foreignId('item_size_id')->nullable()->after('item_packaging_type_id');
            $table->foreignId('item_color_id')->nullable()->after('item_size_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('item_variant_packaging_quantity', function (Blueprint $table) {
            $table->dropColumn(['item_size_id', 'item_color_id']);
        });
    }
};