<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Managers with tick boxes, and stock keepers assigned to locations.
 *
 * facility_managers.abilities  what this manager may do at this location — a
 *                              list drawn from FacilityManager::ABILITIES.
 *                              NULL means every ability, which is what every
 *                              manager assigned before this migration keeps.
 *
 * location_staff               the stock keepers of a location. Staff of a
 *                              store node are staff of its shelf, floor and
 *                              Remote Hub too. Any number per location.
 *
 * The two-manager ceiling is lifted in code (FacilityManager), not here: the
 * table never enforced it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('facility_managers', function (Blueprint $table): void {
            $table->json('abilities')->nullable()->after('is_primary');
        });

        Schema::create('location_staff', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('stock_location_id')->constrained('stock_locations')->cascadeOnDelete();
            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['stock_location_id', 'user_id']);
            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('location_staff');

        Schema::table('facility_managers', function (Blueprint $table): void {
            $table->dropColumn('abilities');
        });
    }
};
