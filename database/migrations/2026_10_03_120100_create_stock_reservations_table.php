<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stock promised to an order but not yet picked (STOCK_PLAN.md §3.2).
 *
 * Checkout reserves at store level — against the store's shelf + floor
 * together — and Pick & Pack turns the reservation into a real debit from
 * whichever leaf the picker confirms. A store can sell
 * on_hand − open reservations, so two checkouts racing for the last unit
 * cannot both win.
 *
 *   open      holding stock
 *   picked    converted into a debit; picked_stock_location_id says from where
 *   released  cancelled or expired; holds nothing
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stock_reservations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sale_item_id')->nullable()->constrained('sale_items')->nullOnDelete();
            $table->foreignId('item_variant_id')->constrained('item_variants')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->unsignedInteger('quantity');
            $table->string('status', 16)->default('open');
            $table->foreignId('picked_stock_location_id')->nullable()->constrained('stock_locations')->nullOnDelete();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('picked_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['item_variant_id', 'store_id', 'status']);
            $table->index(['status', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stock_reservations');
    }
};
