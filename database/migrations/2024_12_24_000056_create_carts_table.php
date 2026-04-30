<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('carts', function (Blueprint $table) {
            $table->id();

            // The Store that owns this transaction
            $table->foreignId('store_id')
                ->constrained()
                ->onDelete('cascade');

            // The person who created/owns the session (likely the Seller)
            $table->foreignId('user_id')
                ->nullable()
                ->constrained()
                ->onDelete('cascade');

            // The specific Customer this cart is being built for
            $table->foreignId('customer_id')
                ->nullable()
                ->constrained()
                ->onDelete('set null');

            // Explicit Seller ID (Useful if the 'user_id' is a staff member acting for a seller)
            $table->foreignId('seller_id')
                ->nullable()
                ->constrained('users')
                ->onDelete('set null');

            $table->string('session_id')->nullable()->index()->after('user_id');

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('carts');
    }
};
