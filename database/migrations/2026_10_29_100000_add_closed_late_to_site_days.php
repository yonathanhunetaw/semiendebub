<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A day nobody closed is closed afterwards by a manager, who says when the shop
 * really closed. This marks those days (docs/plans/time-and-business-day.md).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('site_days', 'closed_late')) {
            Schema::table('site_days', function (Blueprint $table): void {
                $table->boolean('closed_late')->default(false)->after('closed_by');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('site_days', 'closed_late')) {
            Schema::table('site_days', function (Blueprint $table): void {
                $table->dropColumn('closed_late');
            });
        }
    }
};
