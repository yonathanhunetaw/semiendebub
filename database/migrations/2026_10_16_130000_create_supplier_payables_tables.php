<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Money owed to suppliers (procurement P2).
 *
 *   purchases.payment_schedule   the template on a draft: rows of percent or amount + when due
 *   supplier_payables            one charge owed: a PO's goods now, a container's freight/customs later
 *   payable_installments         its schedule, written when the order is approved
 *   supplier_payments            each payment: recorded (claimed) by one person, confirmed by another,
 *                                at the rate actually paid
 *
 * What is still owed and what is overdue are computed from these rows, never stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table): void {
            // [{label, percent|null, amount|null, due: on_order|after_order|after_shipping|after_arrival|on_date, days|null, date|null}]
            $table->json('payment_schedule')->nullable()->after('payment_days');
            // fixed_date terms: what the N days count from (order or shipping / bill of lading).
            $table->string('payment_anchor', 20)->nullable()->after('payment_schedule');
        });

        Schema::create('supplier_payables', function (Blueprint $table): void {
            $table->id();
            $table->morphs('payable');
            $table->foreignId('supplier_id')->nullable()->constrained('suppliers')->nullOnDelete();
            $table->string('kind', 20)->default('goods'); // goods | freight | customs | other
            $table->string('description')->nullable();
            $table->char('currency', 3);
            $table->decimal('amount', 18, 2);
            // The rate the order was raised at: the ETB estimate for what is still unpaid.
            $table->decimal('estimate_rate', 18, 6)->default(1);
            $table->timestamp('cancelled_at')->nullable();
            $table->timestamps();

            $table->index(['supplier_id', 'cancelled_at']);
        });

        Schema::create('payable_installments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('supplier_payable_id')->constrained('supplier_payables')->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence');
            $table->string('label');
            $table->decimal('percent', 7, 4)->nullable();
            $table->decimal('amount', 18, 2);
            $table->string('due_rule', 20); // on_order | after_order | after_shipping | after_arrival | on_date
            $table->unsignedSmallInteger('due_days')->nullable();
            $table->date('due_date')->nullable();
            $table->timestamps();

            $table->unique(['supplier_payable_id', 'sequence']);
        });

        Schema::create('supplier_payments', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('supplier_payable_id')->constrained('supplier_payables')->cascadeOnDelete();
            $table->foreignId('payable_installment_id')->constrained('payable_installments')->cascadeOnDelete();
            $table->char('currency', 3);
            $table->decimal('amount', 18, 2);
            $table->decimal('exchange_rate', 18, 6);
            $table->decimal('amount_etb', 18, 2);
            $table->date('paid_on');
            $table->string('method', 20); // bank_transfer | swift | wallet | cash | other
            $table->foreignId('payment_account_id')->nullable()->constrained('payment_accounts')->nullOnDelete();
            $table->string('reference')->nullable();
            $table->string('notes', 500)->nullable();
            $table->string('status', 20)->default('claimed'); // claimed | confirmed | rejected
            $table->foreignId('claimed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable();
            $table->foreignId('confirmed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable();
            $table->foreignId('rejected_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable();
            $table->string('reject_reason')->nullable();
            $table->timestamps();

            $table->index(['status', 'claimed_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supplier_payments');
        Schema::dropIfExists('payable_installments');
        Schema::dropIfExists('supplier_payables');

        Schema::table('purchases', function (Blueprint $table): void {
            $table->dropColumn(['payment_schedule', 'payment_anchor']);
        });
    }
};
