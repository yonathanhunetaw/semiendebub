<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Checkout, Pick & pack and freight follow-ups:
 *
 *   sales.delivery_fee / delivery_option   a fee the seller typed at checkout
 *                                          is part of the order total.
 *   sales.picking_started_* / packed_at    someone started picking, ticked the
 *   sale_items.ticked_*                    lines in hand and packed it, so the
 *                                          courier and the other roles see the
 *                                          order moving before it is handed over.
 *   deliveries.method / driver_phone       "courier" to an address, or a
 *                                          "vehicle" that comes to collect it.
 *   users.is_driver                        only drivers may carry freight runs;
 *                                          couriers who already did are drivers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('delivery_fee', 12, 2)->default(0)->after('discount_amount');
            $table->string('delivery_option', 20)->nullable()->after('delivery_fee');
            $table->timestamp('picking_started_at')->nullable()->after('delay_agreed_at');
            $table->foreignId('picking_started_by')->nullable()->after('picking_started_at')->constrained('users')->nullOnDelete();
            $table->timestamp('packed_at')->nullable()->after('picking_started_by');
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->timestamp('ticked_at')->nullable();
            $table->foreignId('ticked_by')->nullable()->constrained('users')->nullOnDelete();
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->string('method', 16)->default('courier')->after('status');
            $table->string('driver_phone', 32)->nullable()->after('vehicle_plate');
        });

        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_driver')->default(false)->after('role');
        });

        $drivers = DB::table('shipments')->whereNotNull('courier_id')->distinct()->pluck('courier_id');

        if ($drivers->isNotEmpty()) {
            DB::table('users')->whereIn('id', $drivers)->update(['is_driver' => true]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_driver');
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropColumn(['method', 'driver_phone']);
        });

        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('ticked_by');
            $table->dropColumn('ticked_at');
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropConstrainedForeignId('picking_started_by');
            $table->dropColumn(['delivery_fee', 'delivery_option', 'picking_started_at', 'packed_at']);
        });
    }
};
