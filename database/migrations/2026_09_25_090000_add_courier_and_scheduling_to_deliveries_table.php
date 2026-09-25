<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The deliveries table identified its courier only by name, so a driver had no
 * way to ask "which runs are mine?". This adds the FK the Delivery module
 * needs, plus the scheduling and proof-of-delivery columns the floor uses.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('deliveries', function (Blueprint $table): void {
            if (! Schema::hasColumn('deliveries', 'courier_id')) {
                $table->foreignId('courier_id')
                    ->nullable()
                    ->after('courier_name')
                    ->constrained('users')
                    ->nullOnDelete();
            }

            if (! Schema::hasColumn('deliveries', 'scheduled_for')) {
                $table->timestamp('scheduled_for')->nullable()->after('courier_id');
            }

            if (! Schema::hasColumn('deliveries', 'picked_up_at')) {
                $table->timestamp('picked_up_at')->nullable()->after('scheduled_for');
            }

            if (! Schema::hasColumn('deliveries', 'failed_at')) {
                $table->timestamp('failed_at')->nullable()->after('delivered_at');
            }

            if (! Schema::hasColumn('deliveries', 'failure_reason')) {
                $table->string('failure_reason')->nullable()->after('failed_at');
            }

            if (! Schema::hasColumn('deliveries', 'proof_of_delivery')) {
                $table->string('proof_of_delivery')->nullable()->after('failure_reason');
            }
        });
    }

    public function down(): void
    {
        Schema::table('deliveries', function (Blueprint $table): void {
            if (Schema::hasColumn('deliveries', 'courier_id')) {
                $table->dropConstrainedForeignId('courier_id');
            }

            $table->dropColumn(array_values(array_filter([
                Schema::hasColumn('deliveries', 'scheduled_for') ? 'scheduled_for' : null,
                Schema::hasColumn('deliveries', 'picked_up_at') ? 'picked_up_at' : null,
                Schema::hasColumn('deliveries', 'failed_at') ? 'failed_at' : null,
                Schema::hasColumn('deliveries', 'failure_reason') ? 'failure_reason' : null,
                Schema::hasColumn('deliveries', 'proof_of_delivery') ? 'proof_of_delivery' : null,
            ])));
        });
    }
};
