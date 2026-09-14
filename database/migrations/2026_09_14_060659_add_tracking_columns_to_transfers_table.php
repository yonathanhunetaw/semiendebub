<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transfers', function (Blueprint $table) {
            // When the source dispatched it (pending → in_transit)
            $table->timestamp('dispatched_at')->nullable()->after('completed_at');

            // When someone cancelled it (pending/in_transit → cancelled)
            $table->timestamp('cancelled_at')->nullable()->after('dispatched_at');

            // Expected arrival date
            $table->timestamp('eta')->nullable()->after('cancelled_at');

            // Who cancelled it (audit trail — optional but useful)
            $table->foreignId('cancelled_by')->nullable()->after('cancelled_at')
                ->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('transfers', function (Blueprint $table) {
            $table->dropForeign(['cancelled_by']);
            $table->dropColumn(['dispatched_at', 'cancelled_at', 'eta', 'cancelled_by']);
        });
    }
};