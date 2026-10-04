<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Where a store's shelf may be refilled from, per item, in order.
 *
 * `sources` is an ordered list drawn from floor, remote_hub, shipment — e.g.
 * pens at one store may be ["floor", "shipment"], never stocked at the Remote
 * Hub. No row means the default route, floor → Remote Hub → shipment. Set by the
 * store's managers; read by App\Services\Inventory\RefillEngine.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('item_refill_routes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->json('sources');
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['store_id', 'item_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_refill_routes');
    }
};
