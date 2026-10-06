<?php

declare(strict_types=1);

use App\Models\Inventory\StockLocation;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * "Store" becomes "Store Floor" and "<Store> Remote Hub" becomes "Remote Hub".
 * A node is already told apart by its parent store, so the name stays short.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('stock_locations')
            ->where('kind', StockLocation::KIND_BACKROOM)
            ->update(['name' => 'Store Floor']);

        DB::table('stock_locations')
            ->where('kind', StockLocation::KIND_REMOTE_HUB)
            ->whereNotNull('store_id')
            ->update(['name' => 'Remote Hub']);
    }

    public function down(): void
    {
        DB::table('stock_locations')
            ->where('kind', StockLocation::KIND_BACKROOM)
            ->update(['name' => 'Store']);
    }
};
