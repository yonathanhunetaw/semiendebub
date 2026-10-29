<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Vendor V2 (docs/plans/missing-areas-prompt.md §6.3): a vendor's store uses
 * Duka's main hubs (Hub A / Hub B) only under contract. Duka's own stores (no
 * owner) always do, whatever this says; see Store::mayUseMainHubs().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('stores', function (Blueprint $table): void {
            $table->boolean('uses_main_hubs')->default(false)->after('owner_id');
        });
    }

    public function down(): void
    {
        Schema::table('stores', function (Blueprint $table): void {
            $table->dropColumn('uses_main_hubs');
        });
    }
};
