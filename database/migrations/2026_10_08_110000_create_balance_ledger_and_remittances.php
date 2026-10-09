<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The seller balance: money a seller holds for the company.
 *
 * Every confirmed deposit or cash payment adds a balance entry for the seller
 * who confirmed it, against the account it landed in (null = cash). The
 * seller hands it over to a settlement account the admin assigned them; once
 * that account's owner confirms the remittance, a negative entry clears it.
 * A balance is the sum of its entries, never a stored number.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Which settlement accounts each seller hands money over to.
        Schema::create('seller_settlement_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('payment_account_id')->constrained('payment_accounts')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['user_id', 'payment_account_id']);
        });

        Schema::create('remittances', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            // The bucket handed over from: an account, or null for cash.
            $table->foreignId('from_payment_account_id')->nullable()->constrained('payment_accounts')->restrictOnDelete();
            $table->foreignId('to_payment_account_id')->constrained('payment_accounts')->restrictOnDelete();
            $table->decimal('amount', 15, 2);
            $table->string('reference', 128)->nullable();
            $table->string('status', 16)->default('claimed');
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });

        Schema::create('balance_entries', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->restrictOnDelete();
            $table->foreignId('payment_account_id')->nullable()->constrained('payment_accounts')->restrictOnDelete();
            // Exactly one source: the payment received, or the remittance that cleared it.
            $table->foreignId('payment_id')->nullable()->unique()->constrained('payments')->restrictOnDelete();
            $table->foreignId('remittance_id')->nullable()->unique()->constrained('remittances')->restrictOnDelete();
            $table->decimal('amount', 15, 2);
            $table->timestamps();

            $table->index(['user_id', 'payment_account_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('balance_entries');
        Schema::dropIfExists('remittances');
        Schema::dropIfExists('seller_settlement_accounts');
    }
};
