<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cash paid out of a store's till (petty cash, fuel): an expense marked
 * paid_from_till comes off what that day's till should hold, and the closed
 * day keeps how much went out (docs/plans/time-and-business-day.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('expenses', 'paid_from_till')) {
            Schema::table('expenses', function (Blueprint $table): void {
                $table->boolean('paid_from_till')->default(false)->after('store_id');
            });
        }

        if (! Schema::hasColumn('site_days', 'cash_paid_out')) {
            Schema::table('site_days', function (Blueprint $table): void {
                $table->decimal('cash_paid_out', 12, 2)->nullable()->after('cash_handed_over');
            });
        }
    }

    public function down(): void
    {
        Schema::table('expenses', fn (Blueprint $table) => $table->dropColumn('paid_from_till'));
        Schema::table('site_days', fn (Blueprint $table) => $table->dropColumn('cash_paid_out'));
    }
};
