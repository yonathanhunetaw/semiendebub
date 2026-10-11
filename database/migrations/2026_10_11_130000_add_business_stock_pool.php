<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stock set aside for Business customers, per store item.
 *
 *   store_variants.business_pool   units of the store's stock (shelf + floor)
 *                                  kept for Business customers; the rest is
 *                                  the Individual (VAT) pool. Null: no split,
 *                                  everyone sells from one count.
 *   stock_reservations.pool        which pool a hold draws on, so the pools
 *                                  stay separate while orders wait.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('store_variants', function (Blueprint $table) {
            $table->unsignedInteger('business_pool')->nullable()->after('active');
        });

        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->string('pool', 12)->nullable()->after('quantity');
        });
    }

    public function down(): void
    {
        Schema::table('stock_reservations', function (Blueprint $table) {
            $table->dropColumn('pool');
        });

        Schema::table('store_variants', function (Blueprint $table) {
            $table->dropColumn('business_pool');
        });
    }
};
