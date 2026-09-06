<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('inventory_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_variant_id')
                ->constrained('store_variants')
                ->cascadeOnDelete();
            
            // Movement classification
            $table->enum('type', [
                'purchase',
                'transfer_in',
                'transfer_out',
                'sale',
                'adjustment',
            ]);

            // Signed integer: positive for stock increases, negative for decreases
            $table->integer('quantity');

            // Polymorphic / audit sources and destinations
            $table->string('source_type')->nullable();
            $table->unsignedBigInteger('source_id')->nullable();
            $table->string('destination_type')->nullable();
            $table->unsignedBigInteger('destination_id')->nullable();

            // Transactional reference (e.g. PO-1001, SALE-20260906-001, TRF-001)
            $table->string('reference_id')->nullable()->index();

            // Initiating user / staff member
            $table->foreignId('user_id')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            // Composite indexes for rapid dynamic ledger queries
            $table->index(['store_variant_id', 'type']);
            $table->index(['source_type', 'source_id']);
            $table->index(['destination_type', 'destination_id']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('inventory_movements');
    }
};
