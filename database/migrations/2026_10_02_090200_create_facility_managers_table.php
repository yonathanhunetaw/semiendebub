<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The one or two people who oversee a warehouse.
 *
 * `warehouses.manager` is a free-text string — a name typed into a box, not a
 * user — so nothing could ever be authorized against it. This table names
 * actual users, and because a "warehouse" in this system is either a row in
 * `warehouses` (a store's off-site unit) or a row in `stores` with
 * type = central_warehouse / remote_warehouse, the facility side is a morph.
 *
 * Two managers at most, one of them primary. The ceiling is enforced in
 * App\Models\Concerns\HasFacilityManagers::syncManagers() rather than by the
 * schema — SQL has no clean way to cap rows per group, and the application is
 * the only writer. The unique index below is what stops the same person being
 * added twice and silently filling both slots.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('facility_managers')) {
            return;
        }

        Schema::create('facility_managers', function (Blueprint $table): void {
            $table->id();

            // facility_type + facility_id: Warehouse or Store.
            $table->morphs('facility');

            $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();

            // The first slot. Escalation and single-contact displays use it.
            $table->boolean('is_primary')->default(false);

            $table->foreignId('assigned_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->unique(['facility_type', 'facility_id', 'user_id'], 'facility_manager_unique');
            $table->index(['user_id', 'facility_type'], 'facility_manager_user_index');
        });

        // Carry over any free-text manager that happens to match a user, so an
        // existing warehouse is not left unmanaged the moment authorization
        // starts reading this table. Matched on the full name the admin screens
        // display; anything else stays as text on warehouses.manager.
        if (! Schema::hasTable('warehouses') || ! Schema::hasTable('users')) {
            return;
        }

        $warehouses = DB::table('warehouses')
            ->whereNotNull('manager')
            ->where('manager', '!=', '')
            ->get(['id', 'manager']);

        foreach ($warehouses as $warehouse) {
            $name = trim((string) $warehouse->manager);

            $userId = DB::table('users')
                ->whereRaw("TRIM(CONCAT(COALESCE(first_name, ''), ' ', COALESCE(last_name, ''))) = ?", [$name])
                ->orWhere('email', $name)
                ->value('id');

            if ($userId === null) {
                continue;
            }

            DB::table('facility_managers')->insert([
                'facility_type' => \App\Models\Inventory\Warehouse::class,
                'facility_id' => $warehouse->id,
                'user_id' => $userId,
                'is_primary' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('facility_managers');
    }
};
