<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One leg of a shelf refill: how much of an item comes from which source.
 *
 * A bin short of its max is filled from the item's refill route in order. Each
 * source that contributes is one row:
 *
 *   floor       store floor → shelf. Approved on creation; it carries the
 *               Transfer the stock keeper shelves (no courier).
 *   remote_hub  Remote Hub → store floor. Waits for the store manager, then the
 *               Remote Hub accepts and a courier carries it.
 *   shipment    a line for the next shipment from Hub A/B to the store floor.
 *               Waits for the store manager; no hub until the shipment is built.
 *
 * Remote Hub and shipment legs are per item per store: a second need for the
 * same item merges into a leg still awaiting approval instead of opening another.
 *
 * Status: pending (awaiting the manager) → approved → in_progress (a transfer
 * or shipment carries it) → fulfilled; or cancelled.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('refill_requests', function (Blueprint $table): void {
            $table->id();
            $table->string('reference')->unique();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('shelf_location_id')->nullable()->constrained('stock_locations')->nullOnDelete();
            $table->foreignId('item_id')->constrained('items')->cascadeOnDelete();
            $table->foreignId('item_variant_id')->constrained('item_variants')->cascadeOnDelete();
            $table->string('source', 20);
            $table->unsignedInteger('quantity');
            $table->string('status', 20)->default('pending');
            $table->boolean('urgent')->default(false);
            $table->string('origin', 20)->default('auto');
            $table->foreignId('transfer_id')->nullable()->constrained('transfers')->nullOnDelete();
            $table->foreignId('shipment_id')->nullable()->constrained('shipments')->nullOnDelete();
            $table->foreignId('raised_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('accepted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('accepted_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('cancelled_at')->nullable();
            $table->string('cancel_reason')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'item_id', 'source', 'status']);
            $table->index(['shelf_location_id', 'item_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('refill_requests');
    }
};
