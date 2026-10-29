<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vendor V3 (docs/plans/missing-areas-prompt.md §6.3): Duka keeps a commission on
 * each paid order of a vendor's store; the rest is the vendor's, paid out with the
 * two-person rule. Duka delivers vendors' orders like its own.
 */
return new class extends Migration
{
    public function up(): void
    {
        // One row: the commission rate, set by a global admin.
        Schema::create('marketplace_settings', function (Blueprint $table): void {
            $table->id();
            $table->decimal('commission_pct', 5, 2);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('vendor_payouts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->string('method', 30);
            $table->string('reference')->nullable();
            $table->string('status', 20)->default('recorded')->index();
            $table->foreignId('recorded_by')->constrained('users');
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->text('reject_reason')->nullable();
            $table->timestamps();
        });

        // What each store earned and was paid: the balance is the sum of `amount`.
        Schema::create('vendor_ledger_entries', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('kind', 20); // earning, reversal, payout
            $table->foreignId('sale_id')->nullable()->constrained('sales')->nullOnDelete();
            $table->foreignId('payout_id')->nullable()->constrained('vendor_payouts')->nullOnDelete();
            $table->decimal('gross', 12, 2)->default(0);
            $table->decimal('commission_pct', 5, 2)->default(0);
            $table->decimal('commission', 12, 2)->default(0);
            $table->decimal('amount', 12, 2);
            $table->timestamps();
            // An order is earned once and reversed once.
            $table->unique(['sale_id', 'kind']);
            $table->index(['store_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('vendor_ledger_entries');
        Schema::dropIfExists('vendor_payouts');
        Schema::dropIfExists('marketplace_settings');
    }
};
