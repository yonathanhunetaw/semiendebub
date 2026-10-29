<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The day's cash as it stood when the day closed (docs/plans/time-and-business-day.md,
 * phase 4). Frozen with the day: a closed day is final, so later confirmations and
 * handovers show on the days they happen, never here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('site_days', function (Blueprint $table): void {
            foreach (['cash_collected', 'cash_unconfirmed', 'cash_handed_over', 'cash_expected', 'till_difference'] as $column) {
                if (! Schema::hasColumn('site_days', $column)) {
                    $table->decimal($column, 12, 2)->nullable()->after('till_count');
                }
            }

            if (! Schema::hasColumn('site_days', 'till_difference_note')) {
                $table->string('till_difference_note', 500)->nullable()->after('till_difference');
            }
        });
    }

    public function down(): void
    {
        Schema::table('site_days', function (Blueprint $table): void {
            $table->dropColumn(['cash_collected', 'cash_unconfirmed', 'cash_handed_over', 'cash_expected', 'till_difference', 'till_difference_note']);
        });
    }
};
