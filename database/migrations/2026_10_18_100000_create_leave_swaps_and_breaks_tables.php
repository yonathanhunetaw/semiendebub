<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Leave, shift swaps and breaks (docs/plans/sites-shifts.md, P6–P8).
 *
 *   leave_requests  a person asks for days off; a manager of a site they
 *                   work at approves or rejects (never their own). A manager
 *                   may record sick leave directly. Approved leave cancels
 *                   the person's shifts on those days.
 *   shift_swaps     the shift's person offers it to a colleague; the
 *                   colleague accepts; a manager approves, and the shift is
 *                   the colleague's.
 *   time_breaks     breaks inside a clock-in; worked time leaves them out.
 *   users.home_area where staff transport drops someone (P5).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_requests', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            // annual | sick | unpaid | other
            $table->string('type', 12);
            $table->date('starts_on');
            $table->date('ends_on');
            $table->string('note', 500)->nullable();
            // requested | approved | rejected | cancelled
            $table->string('status', 12)->default('requested');
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note', 500)->nullable();
            $table->timestamps();

            $table->index(['user_id', 'starts_on']);
            $table->index(['status', 'starts_on']);
        });

        Schema::create('shift_swaps', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('shift_id')->constrained('shifts')->cascadeOnDelete();
            $table->foreignId('from_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('to_id')->constrained('users')->cascadeOnDelete();
            // offered | taken | approved | declined | rejected | cancelled
            $table->string('status', 12)->default('offered');
            $table->string('note', 500)->nullable();
            $table->timestamp('taken_at')->nullable();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note', 500)->nullable();
            $table->timestamps();

            $table->index(['to_id', 'status']);
            $table->index(['shift_id', 'status']);
        });

        Schema::create('time_breaks', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('time_entry_id')->constrained('time_entries')->cascadeOnDelete();
            $table->timestamp('started_at');
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index(['time_entry_id', 'ended_at']);
        });

        Schema::table('users', function (Blueprint $table): void {
            $table->string('home_area', 120)->nullable()->after('store_id');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->dropColumn('home_area');
        });
        Schema::dropIfExists('time_breaks');
        Schema::dropIfExists('shift_swaps');
        Schema::dropIfExists('leave_requests');
    }
};
