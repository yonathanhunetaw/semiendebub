<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * When the courier handed a transfer over at its destination. The stock lands
 * only when the destination's keeper receives it (with their counts), so the
 * courier's hand-over is a time on the record, not a ledger move.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('transfers', function (Blueprint $table): void {
            $table->timestamp('handed_over_at')->nullable()->after('dispatched_at');
        });
    }

    public function down(): void
    {
        Schema::table('transfers', function (Blueprint $table): void {
            $table->dropColumn('handed_over_at');
        });
    }
};
