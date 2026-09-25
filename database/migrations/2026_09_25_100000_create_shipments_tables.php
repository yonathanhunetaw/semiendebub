<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A shipment is one vehicle-load moving between two stores, carrying many SKUs.
 *
 * The existing `transfers` table cannot express this: it holds a single
 * item_variant_id per row, so a manifest of five SKUs is five unrelated rows
 * with nothing tying them to one run, one vehicle or one driver. That is why
 * the Admin and Seller shipment screens were built on hardcoded demo arrays.
 *
 * `shipments` is the header (route, vehicle, driver, status) and
 * `shipment_items` the manifest lines.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shipments', function (Blueprint $table): void {
            $table->id();
            $table->string('reference')->unique();

            // Route. Both ends are stores; the ledger tracks stock per store.
            $table->foreignId('origin_store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('destination_store_id')->constrained('stores')->cascadeOnDelete();

            $table->enum('status', [
                'draft',        // manifest being built
                'scheduled',    // committed, awaiting pick
                'picking',      // stock keeper picking
                'ready',        // picked, awaiting courier
                'dispatched',   // stock has left the origin
                'in_transit',   // courier on the road
                'delivered',    // courier handed over
                'received',     // destination confirmed; stock landed
                'cancelled',
            ])->default('draft')->index();

            // Fleet
            $table->string('vehicle_name')->nullable();
            $table->string('vehicle_plate')->nullable();
            $table->decimal('vehicle_max_cbm', 8, 2)->nullable();
            $table->foreignId('courier_id')->nullable()->constrained('users')->nullOnDelete();

            // Timeline — each transition stamps its own column so a shipment's
            // history is reconstructable from the row alone.
            $table->timestamp('scheduled_for')->nullable();
            $table->timestamp('picked_at')->nullable();
            $table->timestamp('dispatched_at')->nullable();
            $table->timestamp('in_transit_at')->nullable();
            $table->timestamp('delivered_at')->nullable();
            $table->timestamp('received_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamp('eta')->nullable();

            $table->string('gate_pass')->nullable();
            $table->string('slot')->nullable();
            $table->decimal('distance_km', 8, 2)->nullable();
            $table->text('notes')->nullable();
            $table->string('cancel_reason')->nullable();

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['origin_store_id', 'status']);
            $table->index(['destination_store_id', 'status']);
        });

        Schema::create('shipment_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shipment_id')->constrained('shipments')->cascadeOnDelete();
            $table->foreignId('item_variant_id')->constrained('item_variants')->cascadeOnDelete();

            $table->unsignedInteger('quantity');
            // What the stock keeper actually found; may fall short of quantity.
            $table->unsignedInteger('picked_quantity')->default(0);

            $table->decimal('cbm', 10, 3)->nullable();
            $table->decimal('weight_kg', 10, 2)->nullable();
            $table->string('unit')->nullable();
            $table->string('location')->nullable();

            $table->timestamps();

            // One line per SKU per shipment.
            $table->unique(['shipment_id', 'item_variant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shipment_items');
        Schema::dropIfExists('shipments');
    }
};
