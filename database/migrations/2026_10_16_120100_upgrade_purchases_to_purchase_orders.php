<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `purchases` becomes the purchase order: a supplier, a currency and rate,
 * lines, and the draft → submitted → approved → ordered → received → closed
 * workflow with who signed each step.
 *
 * The old enum (pending / received / canceled) becomes a string; existing
 * rows keep their meaning: pending was an order already placed (ordered),
 * canceled is spelt cancelled from now on.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('purchases', function (Blueprint $table): void {
            $table->foreignId('supplier_id')->nullable()->after('supplier_name')->constrained('suppliers')->nullOnDelete();
            $table->char('currency', 3)->default('ETB')->after('supplier_id');
            $table->decimal('exchange_rate', 18, 6)->default(1)->after('currency');
            $table->decimal('subtotal_foreign', 18, 2)->default(0)->after('exchange_rate');
            $table->string('payment_terms', 20)->default('immediate')->after('total_amount');
            $table->unsignedSmallInteger('payment_days')->nullable()->after('payment_terms');
            $table->string('incoterm', 10)->nullable()->after('payment_days');

            $table->timestamp('submitted_at')->nullable();
            $table->foreignId('submitted_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->foreignId('approved_by')->nullable()->constrained('users')->nullOnDelete();
            // Why the approver sent it back to draft.
            $table->string('review_note')->nullable();
            $table->foreignId('ordered_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('closed_at')->nullable();
            $table->timestamp('cancelled_at')->nullable();
            $table->foreignId('cancelled_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('cancel_reason')->nullable();
        });

        Schema::table('purchases', function (Blueprint $table): void {
            $table->string('status', 30)->default('draft')->change();
            $table->index(['status', 'supplier_id']);
        });

        DB::table('purchases')->where('status', 'pending')->update(['status' => 'ordered']);
        DB::table('purchases')->where('status', 'canceled')->update(['status' => 'cancelled']);
    }

    public function down(): void
    {
        DB::table('purchases')->whereIn('status', ['draft', 'submitted', 'approved', 'ordered', 'partially_received'])
            ->update(['status' => 'pending']);
        DB::table('purchases')->where('status', 'closed')->update(['status' => 'received']);
        DB::table('purchases')->where('status', 'cancelled')->update(['status' => 'canceled']);

        Schema::table('purchases', function (Blueprint $table): void {
            $table->dropIndex(['status', 'supplier_id']);
        });

        Schema::table('purchases', function (Blueprint $table): void {
            $table->enum('status', ['pending', 'received', 'canceled'])->default('pending')->change();
        });

        Schema::table('purchases', function (Blueprint $table): void {
            foreach (['supplier_id', 'submitted_by', 'approved_by', 'ordered_by', 'cancelled_by'] as $fk) {
                $table->dropConstrainedForeignId($fk);
            }
            $table->dropColumn([
                'currency', 'exchange_rate', 'subtotal_foreign', 'payment_terms', 'payment_days', 'incoterm',
                'submitted_at', 'approved_at', 'review_note', 'closed_at', 'cancelled_at', 'cancel_reason',
            ]);
        });
    }
};
