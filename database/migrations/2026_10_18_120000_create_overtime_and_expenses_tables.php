<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Overtime and expenses (docs/plans/sites-shifts.md, P10–P11).
 *
 *   overtime_settings   one row: the normal day, the rates (defaults from the
 *                       Ethiopian Labour Proclamation 1156/2019), the night
 *                       window, the weekly rest day, whether a manager approves.
 *   public_holidays     dates worked at the holiday rate.
 *   overtime_approvals  a manager's yes or no on one person's overtime on one
 *                       day (OvertimeService).
 *   expenses            money spent (fuel for a staff ride, rent, salaries…).
 *                       Recorded by one person, confirmed by finance or a
 *                       global admin who is someone else (ExpenseService).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('overtime_settings', function (Blueprint $table): void {
            $table->id();
            $table->unsignedSmallInteger('daily_minutes')->default(480);
            $table->decimal('rate_day', 4, 2)->default(1.5);
            $table->decimal('rate_night', 4, 2)->default(1.75);
            $table->decimal('rate_rest_day', 4, 2)->default(2.0);
            $table->decimal('rate_holiday', 4, 2)->default(2.5);
            $table->time('night_from')->default('22:00');
            $table->time('night_to')->default('06:00');
            $table->unsignedTinyInteger('rest_weekday')->default(0);
            $table->boolean('needs_approval')->default(true);
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });

        Schema::create('public_holidays', function (Blueprint $table): void {
            $table->id();
            $table->date('date')->unique();
            $table->string('name', 120);
            $table->timestamps();
        });

        Schema::create('overtime_approvals', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->date('date');
            // approved | rejected
            $table->string('status', 10);
            // The overtime minutes the decision was about (it is redone if they change).
            $table->unsignedSmallInteger('minutes');
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->string('note', 500)->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'date']);
        });

        Schema::create('expenses', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            // fuel | rent | salaries | utilities | maintenance | tax | other
            $table->string('category', 16);
            $table->decimal('amount', 14, 2);
            $table->string('currency', 3)->default('ETB');
            $table->date('spent_on');
            $table->string('description', 255)->nullable();
            $table->foreignId('vehicle_id')->nullable()->constrained('vehicles')->nullOnDelete();
            $table->decimal('litres', 8, 2)->nullable();
            $table->nullableMorphs('source');
            $table->foreignId('document_id')->nullable()->constrained('documents')->nullOnDelete();
            // claimed | confirmed | rejected
            $table->string('status', 10)->default('claimed');
            $table->foreignId('recorded_by')->constrained('users')->cascadeOnDelete();
            $table->foreignId('decided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('decided_at')->nullable();
            $table->string('reject_reason', 500)->nullable();
            $table->timestamps();

            $table->index(['status', 'spent_on']);
            $table->index(['category', 'spent_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('expenses');
        Schema::dropIfExists('overtime_approvals');
        Schema::dropIfExists('public_holidays');
        Schema::dropIfExists('overtime_settings');
    }
};
