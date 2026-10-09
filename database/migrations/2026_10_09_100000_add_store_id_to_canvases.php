<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Canvases belong to a store, like the rest of the admin store zone.
 *
 * Backfilled from the owner's store. A global admin's canvases (owner with no
 * store) stay null: global, seen by global admins and whoever they share with.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('canvases', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('user_id')->constrained('stores')->nullOnDelete();
        });

        DB::table('canvases')->update([
            'store_id' => DB::raw('(SELECT users.store_id FROM users WHERE users.id = canvases.user_id)'),
        ]);
    }

    public function down(): void
    {
        Schema::table('canvases', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
        });
    }
};
