<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Documents people upload (receipts and bills, for now from the calendar).
 * The file lives on the `services.documents.disk` disk, never public. What the
 * reader made of it is `reading`; once the person agrees, the calendar entry
 * it became is `calendar_event_id` (and the entry points back via its source).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documents', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->foreignId('uploaded_by')->constrained('users')->cascadeOnDelete();
            $table->string('disk', 32);
            $table->string('path');
            $table->string('original_name');
            $table->string('mime_type', 100);
            $table->unsignedInteger('size');
            // unread (no reader set up) | read | failed | added (to the calendar)
            $table->string('status', 16)->default('unread');
            $table->json('reading')->nullable();
            $table->string('read_error', 255)->nullable();
            $table->foreignId('calendar_event_id')->nullable()->constrained('calendar_events')->nullOnDelete();
            $table->timestamps();

            $table->index(['uploaded_by', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('documents');
    }
};
