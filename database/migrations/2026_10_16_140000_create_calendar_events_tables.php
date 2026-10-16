<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The calendar's own entries: reminders, bills, shifts and meetings people add
 * by hand (or, later, that an uploaded document suggests). What the modules
 * already schedule (deliveries, freight, transfers, purchase orders, credit)
 * is never copied here; App\Services\Calendar\CalendarFeed reads it live.
 *
 * An entry may repeat (`repeat` every `repeat_every` units until
 * `repeat_until`). Each occurrence ticked off (a bill paid, a shift worked) is
 * a row in calendar_event_completions, keyed by the day it falls on, so
 * "paid today, due again next month" is one series with today's tick.
 *
 * `source_type`/`source_id` name what the entry came from (an uploaded
 * receipt, say), on the entry and on each tick.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('calendar_events', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->foreignId('created_by')->constrained('users')->cascadeOnDelete();
            $table->string('title', 160);
            $table->text('notes')->nullable();
            // reminder | bill | shift | meeting
            $table->string('kind', 16)->default('reminder');
            // private (the creator only) | shared (everyone who sees the store)
            $table->string('visibility', 16)->default('shared');
            $table->dateTime('starts_at');
            $table->dateTime('ends_at')->nullable();
            $table->boolean('all_day')->default(true);
            // none | daily | weekly | monthly | yearly
            $table->string('repeat', 16)->default('none');
            $table->unsignedSmallInteger('repeat_every')->default(1);
            $table->date('repeat_until')->nullable();
            $table->decimal('amount', 15, 2)->nullable();
            $table->char('currency', 3)->nullable();
            // Who a bill is paid to.
            $table->string('counterparty', 160)->nullable();
            $table->nullableMorphs('source');
            $table->json('meta')->nullable();
            $table->timestamps();

            $table->index(['store_id', 'starts_at']);
            $table->index(['created_by', 'visibility']);
        });

        Schema::create('calendar_event_completions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('calendar_event_id')->constrained('calendar_events')->cascadeOnDelete();
            // The day of the occurrence ticked off (its start date).
            $table->date('occurs_on');
            $table->timestamp('completed_at');
            $table->foreignId('completed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->decimal('amount', 15, 2)->nullable();
            $table->string('note', 255)->nullable();
            $table->nullableMorphs('source');
            $table->timestamps();

            $table->unique(['calendar_event_id', 'occurs_on']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('calendar_event_completions');
        Schema::dropIfExists('calendar_events');
    }
};
