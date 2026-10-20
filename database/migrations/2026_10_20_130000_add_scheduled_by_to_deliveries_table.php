<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/*
 * Who set (or last changed) a delivery's day, and when. The day itself is
 * deliveries.scheduled_for, set from the calendar (DeliveryService::schedule).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->foreignId('scheduled_by')->nullable()->after('scheduled_for')->constrained('users')->nullOnDelete();
            $table->timestamp('schedule_set_at')->nullable()->after('scheduled_by');
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table) {
            $table->dropConstrainedForeignId('scheduled_by');
            $table->dropColumn('schedule_set_at');
        });
    }
};
