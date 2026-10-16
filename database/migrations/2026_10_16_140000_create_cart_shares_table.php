<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A seller shares a cart with its customer (shared.<domain>/c/{token}).
 *
 * The link alone is the customer's key: whoever holds it sees that one cart,
 * priced for that one customer, and may check it out. `token_hash` finds it;
 * `token` (encrypted) lets the seller copy the link again. A cart has at most
 * one live share; sharing again revokes the old link.
 *
 * `payments.claimed_via` marks a transfer the customer themselves said they
 * sent (claimed_by stays null: a customer has no login and can never confirm).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cart_shares', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('cart_id')->constrained('carts')->cascadeOnDelete();
            $table->foreignId('customer_id')->constrained('customers')->cascadeOnDelete();
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->char('token_hash', 64)->unique();
            $table->text('token');
            $table->timestamp('expires_at');
            $table->timestamp('revoked_at')->nullable();
            $table->foreignId('revoked_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('opened_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('customer_edited_at')->nullable();
            $table->timestamp('checked_out_at')->nullable();
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->timestamps();

            $table->index(['cart_id', 'revoked_at']);
        });

        Schema::table('payments', function (Blueprint $table): void {
            $table->string('claimed_via', 20)->nullable()->after('claimed_by');
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table): void {
            $table->dropColumn('claimed_via');
        });

        Schema::dropIfExists('cart_shares');
    }
};
