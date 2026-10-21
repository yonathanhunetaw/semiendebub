<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Consignments (docs/plans/procurement-pipeline.md, PP4): goods we bought,
 * travelling together (a container, an air parcel) from the supplier to the
 * dry port, carrying lines of one or more purchase orders. Each stage holds
 * its stock in the ledger (StockLocation::KIND_INBOUND); each cost paid on
 * the way is a line someone else confirms, spread over the goods by CBM,
 * value or weight. Receiving at the Main Hub is PP5.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('consignments', function (Blueprint $table): void {
            $table->id();
            $table->string('reference', 40)->unique();
            $table->foreignId('freight_route_id')->nullable()->constrained('freight_routes')->nullOnDelete();
            $table->string('container_number', 60)->nullable();
            $table->string('bill_of_lading', 80)->nullable();
            // forming | overseas_warehouse | at_sea | sea_port | dry_port | received | cancelled
            $table->string('stage', 30)->default('forming');
            // {stage: ISO date it got there}
            $table->json('stage_dates')->nullable();
            $table->date('eta')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('stage');
        });

        Schema::create('consignment_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('consignment_id')->constrained('consignments')->cascadeOnDelete();
            $table->foreignId('purchase_line_id')->constrained('purchase_lines')->restrictOnDelete();
            $table->foreignId('item_variant_id')->constrained('item_variants')->restrictOnDelete();
            // In the variant's own packaging unit, like item_stocks.
            $table->unsignedInteger('quantity');
            $table->decimal('cbm', 10, 4)->nullable();
            $table->decimal('weight_kg', 12, 3)->nullable();
            // What these goods cost from the supplier, in ETB at the order's rate.
            $table->decimal('goods_value_etb', 16, 2);
            $table->timestamps();

            $table->unique(['consignment_id', 'purchase_line_id']);
        });

        Schema::create('consignment_costs', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('consignment_id')->constrained('consignments')->cascadeOnDelete();
            $table->string('stage', 30);
            // storage | freight | insurance | duty | excise | vat | surtax | withholding | other | port | land | to_store | misc
            $table->string('kind', 20);
            $table->string('description')->nullable();
            $table->char('currency', 3);
            $table->decimal('exchange_rate', 14, 4);
            $table->decimal('amount', 16, 2);
            $table->decimal('amount_etb', 16, 2);
            // How it is spread over the lines: cbm | value | weight.
            $table->string('allocation', 10);
            // VAT and withholding are claimed back: paid, but not an item's cost.
            $table->boolean('recoverable')->default(false);
            $table->string('reference', 80)->nullable();
            $table->date('paid_on')->nullable();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->string('reject_reason')->nullable();
            $table->timestamps();

            $table->index(['consignment_id', 'confirmed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('consignment_costs');
        Schema::dropIfExists('consignment_lines');
        Schema::dropIfExists('consignments');
    }
};
