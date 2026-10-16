<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What a purchase order buys. `quantity` is counted in the variant's own
 * packaging unit (a Carton variant: cartons), exactly like item_stocks, so
 * receiving it later books the same number. `unit_price` is in the order's
 * currency; `cbm` and `weight_kg` are for the whole line (container fill).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_lines', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('purchase_id')->constrained('purchases')->cascadeOnDelete();
            $table->foreignId('item_variant_id')->constrained('item_variants')->restrictOnDelete();
            $table->string('supplier_sku')->nullable();
            $table->unsignedInteger('quantity');
            $table->decimal('unit_price', 18, 4);
            $table->decimal('line_total', 18, 2);
            $table->decimal('cbm', 10, 4)->nullable();
            $table->decimal('weight_kg', 12, 3)->nullable();
            $table->unsignedInteger('received_quantity')->default(0);
            $table->string('notes')->nullable();
            $table->timestamps();

            $table->unique(['purchase_id', 'item_variant_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_lines');
    }
};
