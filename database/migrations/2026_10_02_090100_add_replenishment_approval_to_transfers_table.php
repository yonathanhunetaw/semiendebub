<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Turns `transfers` into something that can hold a *proposal*, not only an
 * instruction, and lets a transfer name a location at any level.
 *
 * Two problems are fixed here.
 *
 * 1. `status = pending` already means "queued, dispatch it" —
 *    TransferWorkflowService::markDispatched() accepts exactly that status. A
 *    machine-generated suggestion must therefore not be distinguishable only
 *    by its status, or the floor would dispatch something nobody approved.
 *    So approval is a second axis: `approval_state`. A hand-raised transfer is
 *    `not_required` and behaves exactly as before; a proposal is `pending` and
 *    is refused dispatch until a store manager approves it.
 *
 *    The `status` enum is deliberately left alone: it is an enum on MySQL and
 *    a CHECK constraint on SQLite (the test driver), and widening it in place
 *    is a table rebuild on one and a MODIFY on the other for no gain.
 *
 * 2. The legacy `from_location_id` / `to_location_id` pair is constrained to
 *    `item_inventory_locations`, so a transfer could never say "out of the
 *    remote warehouse" or "into this store as a whole". Rather than fight
 *    those foreign keys, the endpoints get a polymorphic pair of their own —
 *    the same (type, id) vocabulary `item_stocks` and the new
 *    `store_variant_capacities` use. The old columns keep working untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transfers', function (Blueprint $table): void {
            // ── Where the stock actually moves, at any level ──
            if (! Schema::hasColumn('transfers', 'source_location_type')) {
                $table->string('source_location_type')->nullable()->after('to_location_id');
                $table->unsignedBigInteger('source_location_id')->nullable()->after('source_location_type');
            }

            if (! Schema::hasColumn('transfers', 'destination_location_type')) {
                $table->string('destination_location_type')->nullable()->after('source_location_id');
                $table->unsignedBigInteger('destination_location_id')->nullable()->after('destination_location_type');
            }

            // ── Proposal provenance and the approval gate ──
            if (! Schema::hasColumn('transfers', 'origin')) {
                // manual | auto_replenishment
                $table->string('origin')->default('manual')->after('quantity');
            }

            if (! Schema::hasColumn('transfers', 'approval_state')) {
                // not_required | pending | approved | rejected
                $table->string('approval_state')->default('not_required')->after('origin');
            }

            if (! Schema::hasColumn('transfers', 'approved_by')) {
                $table->foreignId('approved_by')->nullable()->after('approval_state')
                    ->constrained('users')->nullOnDelete();
                $table->timestamp('approved_at')->nullable()->after('approved_by');
            }

            if (! Schema::hasColumn('transfers', 'rejected_by')) {
                $table->foreignId('rejected_by')->nullable()->after('approved_at')
                    ->constrained('users')->nullOnDelete();
                $table->timestamp('rejected_at')->nullable()->after('rejected_by');
                $table->string('rejection_reason')->nullable()->after('rejected_at');
            }

            // ── What the planner saw, so the approval screen can show its working ──
            if (! Schema::hasColumn('transfers', 'observed_quantity')) {
                $table->integer('observed_quantity')->nullable()->after('rejection_reason');
                $table->unsignedInteger('min_capacity')->nullable()->after('observed_quantity');
                $table->unsignedInteger('max_capacity')->nullable()->after('min_capacity');
            }
        });

        Schema::table('transfers', function (Blueprint $table): void {
            $table->index(['approval_state', 'status'], 'transfers_approval_status_index');
            $table->index(
                ['destination_location_type', 'destination_location_id'],
                'transfers_destination_location_index',
            );
        });

        // Everything that exists was raised by a person and needs no approval.
        DB::table('transfers')->whereNull('approval_state')->update(['approval_state' => 'not_required']);
        DB::table('transfers')->whereNull('origin')->update(['origin' => 'manual']);
    }

    public function down(): void
    {
        Schema::table('transfers', function (Blueprint $table): void {
            $table->dropIndex('transfers_approval_status_index');
            $table->dropIndex('transfers_destination_location_index');
        });

        Schema::table('transfers', function (Blueprint $table): void {
            foreach (['approved_by', 'rejected_by'] as $column) {
                if (Schema::hasColumn('transfers', $column)) {
                    $table->dropConstrainedForeignId($column);
                }
            }
        });

        Schema::table('transfers', function (Blueprint $table): void {
            $columns = array_values(array_filter([
                'source_location_type', 'source_location_id',
                'destination_location_type', 'destination_location_id',
                'origin', 'approval_state', 'approved_at',
                'rejected_at', 'rejection_reason',
                'observed_quantity', 'min_capacity', 'max_capacity',
            ], fn (string $column): bool => Schema::hasColumn('transfers', $column)));

            if ($columns !== []) {
                $table->dropColumn($columns);
            }
        });
    }
};
