<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('item_variants', function (Blueprint $table): void {
            // Scanners look a variant up by its barcode; uniqueness is checked in ItemWriter (soft-deleted rows keep theirs).
            $table->index('barcode', 'item_variants_barcode_index');
        });

        Schema::table('items', function (Blueprint $table): void {
            // 0-100, written by ItemReadiness::refresh(); null until first computed. Lets the list sort and filter.
            $table->unsignedTinyInteger('readiness_percent')->nullable()->after('is_incomplete');
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table): void {
            $table->dropColumn('readiness_percent');
        });

        Schema::table('item_variants', function (Blueprint $table): void {
            $table->dropIndex('item_variants_barcode_index');
        });
    }
};
