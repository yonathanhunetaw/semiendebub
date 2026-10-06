<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The hand-offs after a run is scheduled, each a two-step act:
 *
 *   origin keeper   picking (picked_at) → prepared in the pickup bay (prepared_at)
 *   driver          starts the trip → checks the load → signs (en route)
 *   driver          arrives at the destination (delivered_at)
 *   receiver        checks the goods → signs (received_at)
 *
 * Signatures are stored as the PNG data URL the pad produced.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->timestamp('prepared_at')->nullable()->after('picked_at');
            $table->foreignId('prepared_by')->nullable()->after('prepared_at')->constrained('users')->nullOnDelete();
            $table->timestamp('courier_started_at')->nullable()->after('prepared_by');
            $table->timestamp('courier_checked_at')->nullable()->after('courier_started_at');
            $table->longText('courier_signature')->nullable()->after('courier_checked_at');
            $table->timestamp('courier_signed_at')->nullable()->after('courier_signature');
            $table->timestamp('receiver_checked_at')->nullable()->after('received_at');
            $table->longText('receiver_signature')->nullable()->after('receiver_checked_at');
            $table->foreignId('received_by')->nullable()->after('receiver_signature')->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('shipments', function (Blueprint $table) {
            $table->dropConstrainedForeignId('prepared_by');
            $table->dropConstrainedForeignId('received_by');
            $table->dropColumn([
                'prepared_at', 'courier_started_at', 'courier_checked_at', 'courier_signature',
                'courier_signed_at', 'receiver_checked_at', 'receiver_signature',
            ]);
        });
    }
};
