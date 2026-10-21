<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Landed-cost estimates (docs/plans/procurement-pipeline.md, PP3).
 *
 *   exchange_rates   the latest rate procurement set per currency (one row per change)
 *   freight_routes   what a route costs per CBM, before any real shipment exists
 *   tariffs          the government's tax rates per HS code, kept by the owner
 *   supplier_quotes  what a supplier asks for an idea, and the estimate it gives
 *   items.hs_code    an item's HS code, to find its tariff
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exchange_rates', function (Blueprint $table): void {
            $table->id();
            $table->char('currency', 3);
            // ETB for one unit of the currency.
            $table->decimal('rate', 14, 4);
            $table->foreignId('set_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['currency', 'id']);
        });

        Schema::create('freight_routes', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('origin', 120)->nullable();
            // What the foreign legs (overseas storage, sea freight) are priced in.
            $table->char('currency', 3)->default('USD');
            $table->decimal('overseas_storage_per_cbm', 12, 2)->default(0);
            $table->decimal('sea_freight_per_cbm', 12, 2)->default(0);
            $table->decimal('insurance_pct', 6, 3)->default(0);
            // The local legs, in ETB.
            $table->decimal('port_clearing_per_cbm', 12, 2)->default(0);
            $table->decimal('land_transport_per_cbm', 12, 2)->default(0);
            $table->decimal('to_store_per_cbm', 12, 2)->default(0);
            $table->unsignedSmallInteger('transit_days')->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('tariffs', function (Blueprint $table): void {
            $table->id();
            $table->string('hs_code', 20)->unique();
            $table->string('description')->nullable();
            $table->decimal('duty_pct', 6, 3)->default(0);
            $table->decimal('excise_pct', 6, 3)->default(0);
            $table->decimal('vat_pct', 6, 3)->default(0);
            $table->decimal('surtax_pct', 6, 3)->default(0);
            $table->decimal('withholding_pct', 6, 3)->default(0);
            // Anything else charged on the customs value that is a cost (a levy, a fee).
            $table->decimal('other_pct', 6, 3)->default(0);
            $table->date('effective_from')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('items', function (Blueprint $table): void {
            $table->string('hs_code', 20)->nullable()->after('product_name');
        });

        Schema::create('supplier_quotes', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_idea_id')->constrained('product_ideas')->cascadeOnDelete();
            $table->foreignId('supplier_id')->constrained('suppliers')->restrictOnDelete();
            $table->char('currency', 3);
            // ETB for one unit of the currency, when the quote was taken.
            $table->decimal('exchange_rate', 14, 4);
            $table->decimal('unit_price', 14, 4);
            $table->unsignedInteger('moq')->default(1);
            $table->unsignedInteger('pieces_per_carton')->default(1);
            $table->decimal('cbm_per_carton', 10, 4)->nullable();
            $table->decimal('kg_per_carton', 10, 3)->nullable();
            $table->unsignedSmallInteger('lead_days')->nullable();
            $table->date('valid_until')->nullable();
            $table->string('hs_code', 20)->nullable();
            $table->foreignId('freight_route_id')->nullable()->constrained('freight_routes')->nullOnDelete();
            // How many pieces the estimate is for (defaults to the MOQ).
            $table->unsignedInteger('quantity');
            // Route figures replaced on this quote: {sea_freight_per_cbm: 120, …}
            $table->json('overrides')->nullable();
            // The breakdown when it was last saved, so later rate changes do not rewrite history.
            $table->json('estimate')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_quotes');
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn('hs_code');
        });
        Schema::dropIfExists('tariffs');
        Schema::dropIfExists('freight_routes');
        Schema::dropIfExists('exchange_rates');
    }
};
