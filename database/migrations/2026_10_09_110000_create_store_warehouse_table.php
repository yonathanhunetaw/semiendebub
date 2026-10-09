<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * A warehouse can serve one or several stores.
 *
 * `warehouses.store_id` held a single store. It is backfilled into this pivot
 * and kept for the transition (WarehouseController writes the first served
 * store into it); nothing in the stock code reads it any more.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('store_warehouse', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['store_id', 'warehouse_id']);
        });

        $now = now();

        DB::table('warehouses')->whereNotNull('store_id')->orderBy('id')->get(['id', 'store_id'])
            ->each(fn ($warehouse) => DB::table('store_warehouse')->insert([
                'store_id' => $warehouse->store_id,
                'warehouse_id' => $warehouse->id,
                'created_at' => $now,
                'updated_at' => $now,
            ]));
    }

    public function down(): void
    {
        Schema::dropIfExists('store_warehouse');
    }
};
