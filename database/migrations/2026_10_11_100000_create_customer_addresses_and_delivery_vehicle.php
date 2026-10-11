<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Where a customer takes deliveries, saved from checkout so the next order
 * can pick it again; and the vehicle (fleet or a typed plate) a delivery
 * goes out on.
 *
 * Also gives seller-created customers the store of the seller who added
 * them: they were saved with no store, so no store admin could see them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('customer_addresses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->string('label')->nullable();
            $table->text('address');
            $table->string('recipient_name')->nullable();
            $table->string('recipient_phone', 32)->nullable();
            $table->unsignedInteger('times_used')->default(0);
            $table->timestamp('last_used_at')->nullable();
            $table->timestamps();

            $table->index(['customer_id', 'last_used_at']);
        });

        Schema::table('deliveries', function (Blueprint $table) {
            $table->foreignId('vehicle_id')->nullable()->after('courier_id')->constrained('vehicles')->nullOnDelete();
            $table->string('vehicle_plate', 32)->nullable()->after('vehicle_id');
            $table->foreignId('customer_address_id')->nullable()->after('delivery_address')
                ->constrained('customer_addresses')->nullOnDelete();
        });

        $stores = DB::table('customers')
            ->join('users', 'users.id', '=', 'customers.created_by')
            ->whereNull('customers.store_id')
            ->whereNotNull('users.store_id')
            ->pluck('users.store_id', 'customers.id');

        foreach ($stores as $customerId => $storeId) {
            DB::table('customers')->where('id', $customerId)->update(['store_id' => $storeId]);
        }
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('customer_address_id');
            $table->dropConstrainedForeignId('vehicle_id');
            $table->dropColumn('vehicle_plate');
        });

        Schema::dropIfExists('customer_addresses');
    }
};
