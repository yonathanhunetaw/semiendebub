<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Product ideas: an item someone thinks the business should sell, before it
 * is an item (docs/plans/procurement-pipeline.md, PP1). Raised on the store
 * side (seller, store admin, global admin) or by procurement ("have you
 * considered this?"). It becomes an Item only when bought.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_ideas', function (Blueprint $table): void {
            $table->id();
            // null = for every store (a global admin's or procurement's idea).
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->foreignId('suggested_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('source', 20)->default('store');
            $table->string('name');
            $table->text('spec')->nullable();
            $table->text('reason')->nullable();
            // What the store thinks it would sell one piece for, in ETB.
            $table->decimal('target_price', 14, 2)->nullable();
            $table->string('status', 20)->default('suggested');
            $table->foreignId('status_changed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('status_changed_at')->nullable();
            // Set when it is bought (PP5).
            $table->foreignId('item_id')->nullable()->constrained('items')->nullOnDelete();
            $table->foreignId('purchase_line_id')->nullable()->constrained('purchase_lines')->nullOnDelete();
            $table->timestamps();

            $table->index(['status', 'store_id']);
        });

        Schema::create('product_idea_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('product_idea_id')->constrained('product_ideas')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('from_status', 20)->nullable();
            $table->string('to_status', 20);
            $table->text('note')->nullable();
            $table->timestamp('created_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_idea_events');
        Schema::dropIfExists('product_ideas');
    }
};
