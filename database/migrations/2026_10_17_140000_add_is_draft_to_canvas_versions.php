<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * An autosave is one draft row per person per canvas, rewritten in place, so
     * it never fills the version history.
     */
    public function up(): void
    {
        Schema::table('canvas_versions', function (Blueprint $table) {
            $table->boolean('is_draft')->default(false)->after('comment');
            $table->index(['canvas_id', 'is_draft']);
        });
    }

    public function down(): void
    {
        Schema::table('canvas_versions', function (Blueprint $table) {
            $table->dropIndex(['canvas_id', 'is_draft']);
            $table->dropColumn('is_draft');
        });
    }
};
