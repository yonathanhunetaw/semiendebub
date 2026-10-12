<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How much a stock location holds by volume, entered by hand (no floor plan).
 * Null means not set; the levels page then shows used volume only.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stock_locations', function (Blueprint $table): void {
            $table->decimal('capacity_cbm', 10, 2)->nullable()->after('is_stockable');
        });
    }

    public function down(): void
    {
        Schema::table('stock_locations', function (Blueprint $table): void {
            $table->dropColumn('capacity_cbm');
        });
    }
};
