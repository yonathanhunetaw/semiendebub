<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Payment accounts, and payments that have to be confirmed.
 *
 * A payment account is a bank account or wallet the admin set up for a store
 * and gave to one owner (a seller). Customers pay into active collection
 * accounts; the owner is the one who checks the deposit arrived.
 *
 * A payment is now one part of an order's split. It starts pending, the
 * seller marks it claimed when the customer says they paid, and the account's
 * owner confirms it (or sends it back to pending: "not received yet"). The
 * old enum of pending/completed/failed/refunded becomes a string so those
 * states fit; existing completed rows read as confirmed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payment_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->string('type', 16);
            $table->string('provider', 32);
            $table->string('account_number', 64);
            $table->string('account_name');
            $table->foreignId('owner_user_id')->constrained('users')->restrictOnDelete();
            $table->string('purpose', 16)->default('collection');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->softDeletes();

            $table->index(['store_id', 'purpose', 'is_active']);
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->string('status', 16)->default('pending')->change();
            $table->timestamp('paid_at')->nullable()->change();

            $table->foreignId('payment_account_id')->nullable()->after('payment_method')
                ->constrained('payment_accounts')->nullOnDelete();
            $table->timestamp('claimed_at')->nullable()->after('paid_at');
            $table->foreignId('claimed_by')->nullable()->after('claimed_at')->constrained('users')->nullOnDelete();
            $table->timestamp('confirmed_at')->nullable()->after('claimed_by');
            $table->foreignId('confirmed_by')->nullable()->after('confirmed_at')->constrained('users')->nullOnDelete();
            $table->timestamp('rejected_at')->nullable()->after('confirmed_by');
            $table->foreignId('rejected_by')->nullable()->after('rejected_at')->constrained('users')->nullOnDelete();
        });

        // Money already taken under the old flow was treated as received.
        DB::table('payments')->where('status', 'completed')->update([
            'status' => 'confirmed',
            'confirmed_at' => DB::raw('COALESCE(paid_at, created_at)'),
            'confirmed_by' => DB::raw('user_id'),
        ]);
    }

    public function down(): void
    {
        DB::table('payments')->where('status', 'confirmed')->update(['status' => 'completed']);
        DB::table('payments')->whereNotIn('status', ['pending', 'completed', 'failed', 'refunded'])->update(['status' => 'failed']);

        Schema::table('payments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('rejected_by');
            $table->dropColumn('rejected_at');
            $table->dropConstrainedForeignId('confirmed_by');
            $table->dropColumn('confirmed_at');
            $table->dropConstrainedForeignId('claimed_by');
            $table->dropColumn('claimed_at');
            $table->dropConstrainedForeignId('payment_account_id');
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->enum('status', ['pending', 'completed', 'failed', 'refunded'])->default('completed')->change();
        });

        Schema::dropIfExists('payment_accounts');
    }
};
