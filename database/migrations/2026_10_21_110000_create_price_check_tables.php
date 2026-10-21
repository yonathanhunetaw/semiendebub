<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Price checks (docs/plans/procurement-pipeline.md, PP2): sellers go to other
 * shops and write down what an item sells for there, per pack and quantity.
 *
 *   shops               the other shops in the market
 *   store_shops         per store: which shops to check and which to avoid
 *   price_checks        a task: check this idea (or item) at this store's shops
 *   price_check_users   the sellers named on a check (none = any seller of the store)
 *   price_observations  one price seen at one shop, verified by someone else
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shops', function (Blueprint $table): void {
            $table->id();
            $table->string('name');
            $table->string('area', 120)->nullable();
            $table->string('phone', 40)->nullable();
            $table->text('notes')->nullable();
            $table->boolean('is_active')->default(true);
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['is_active', 'name']);
        });

        Schema::create('store_shops', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('shop_id')->constrained('shops')->cascadeOnDelete();
            $table->string('mode', 10)->default('check');
            $table->timestamps();

            $table->unique(['store_id', 'shop_id']);
        });

        Schema::create('price_checks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->foreignId('product_idea_id')->nullable()->constrained('product_ideas')->cascadeOnDelete();
            $table->foreignId('item_id')->nullable()->constrained('items')->cascadeOnDelete();
            $table->unsignedSmallInteger('shops_wanted')->default(3);
            $table->date('due_on')->nullable();
            $table->text('note')->nullable();
            $table->string('status', 10)->default('open');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status']);
        });

        Schema::create('price_check_users', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('price_check_id')->constrained('price_checks')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            $table->unique(['price_check_id', 'user_id']);
        });

        Schema::create('price_observations', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('price_check_id')->constrained('price_checks')->cascadeOnDelete();
            $table->foreignId('shop_id')->constrained('shops')->cascadeOnDelete();
            $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
            $table->date('observed_on');
            // piece | packet | carton
            $table->string('pack_type', 10)->default('piece');
            $table->unsignedInteger('pieces_per_pack')->default(1);
            // The price holds from this many packs (1, 10, 50, 100…).
            $table->unsignedInteger('min_qty')->default(1);
            // ETB for one pack at that quantity.
            $table->decimal('price', 14, 2);
            $table->decimal('price_per_piece', 16, 4);
            $table->text('note')->nullable();
            $table->foreignId('verified_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('verified_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->text('reject_reason')->nullable();
            $table->timestamps();

            $table->index(['price_check_id', 'shop_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('price_observations');
        Schema::dropIfExists('price_check_users');
        Schema::dropIfExists('price_checks');
        Schema::dropIfExists('store_shops');
        Schema::dropIfExists('shops');
    }
};
