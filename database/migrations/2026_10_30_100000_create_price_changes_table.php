<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Every change to a store's prices: the store price, a seller's, a customer's
 * and the individual (with-VAT) price of a store variant. What a price was on
 * any date can be read back (App\Services\Item\PriceHistory). Sale lines keep
 * their own price at checkout; this is the catalogue's history.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('price_changes')) {
            return;
        }

        Schema::create('price_changes', function (Blueprint $table): void {
            $table->id();
            // store | seller | customer | individual
            $table->string('kind', 20);
            $table->morphs('priceable');
            $table->foreignId('store_variant_id')->nullable()->constrained('store_variants')->nullOnDelete();
            $table->unsignedBigInteger('store_id')->nullable()->index();
            $table->json('old_matrix')->nullable();
            $table->json('new_matrix')->nullable();
            $table->decimal('old_price', 12, 2)->nullable();
            $table->decimal('new_price', 12, 2)->nullable();
            $table->foreignId('changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('created_at')->nullable();

            $table->index(['store_variant_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_changes');
    }
};
