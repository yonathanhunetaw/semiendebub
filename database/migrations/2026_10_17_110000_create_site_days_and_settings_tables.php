<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Opening and closing (docs/plans/sites-shifts.md, P2).
 *
 *   site_settings  per site: the counter QR's secret, the grace before an
 *                  opening counts as missed, the opening/closing checklists
 *   site_days      one row per site per date: who is to open and close, who
 *                  did and when, the checklist ticks, cash float and till count
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('site_settings', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->unique()->constrained('stock_locations')->cascadeOnDelete();
            $table->string('qr_secret', 64);
            // Bumped to void a printed QR that leaked.
            $table->unsignedInteger('qr_version')->default(1);
            $table->unsignedSmallInteger('open_grace_minutes')->default(15);
            $table->json('opening_checklist')->nullable();
            $table->json('closing_checklist')->nullable();
            $table->timestamps();
        });

        Schema::create('site_days', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->date('date');
            // planned | open | closed | missed | closed_day
            $table->string('status', 16)->default('planned');
            $table->foreignId('opener_id')->nullable()->constrained('users')->nullOnDelete();
            $table->foreignId('closer_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('opened_at')->nullable();
            $table->foreignId('opened_by')->nullable()->constrained('users')->nullOnDelete();
            $table->boolean('opened_without_key')->default(false);
            $table->json('open_checklist')->nullable();
            $table->decimal('float_amount', 12, 2)->nullable();
            $table->string('open_note', 500)->nullable();
            $table->timestamp('closed_at')->nullable();
            $table->foreignId('closed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->json('close_checklist')->nullable();
            $table->decimal('till_count', 12, 2)->nullable();
            $table->string('close_note', 500)->nullable();
            $table->timestamp('missed_at')->nullable();
            $table->timestamps();

            $table->unique(['stock_location_id', 'date']);
            $table->index(['date', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('site_days');
        Schema::dropIfExists('site_settings');
    }
};
