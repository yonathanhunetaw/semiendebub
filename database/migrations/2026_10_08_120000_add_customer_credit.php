<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Customer credit, set only by an admin.
 *
 * A customer with a credit limit and a number of days to pay can put all or
 * part of an order on credit. That part is a payment with method `credit`;
 * the sale carries the date it is due. Repayments are payments too, against
 * the customer rather than a sale (kind `credit_repayment`), confirmed by the
 * account owner like any deposit.
 *
 * `credit_override` lets an admin keep a customer buying on credit while an
 * invoice is overdue.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->decimal('credit_limit', 15, 2)->nullable();
            $table->unsignedSmallInteger('credit_days')->nullable();
            $table->boolean('credit_override')->default(false);
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->date('due_date')->nullable()->after('payment_status');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->foreignId('sale_id')->nullable()->change();
            $table->string('kind', 24)->default('sale')->after('sale_id');
            $table->foreignId('customer_id')->nullable()->after('kind')->constrained('customers')->restrictOnDelete();

            $table->index(['customer_id', 'kind', 'status']);
        });
    }

    public function down(): void
    {
        // The foreign key first: MySQL backs it with the composite index.
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['customer_id']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->dropIndex(['customer_id', 'kind', 'status']);
            $table->dropColumn(['customer_id', 'kind']);
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn('due_date');
        });

        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn(['credit_limit', 'credit_days', 'credit_override']);
        });
    }
};
