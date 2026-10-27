<?php

use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Role;

/**
 * A store admin used to enter the seller, store manager and stock keeper apps
 * through a blanket allow-list. Those apps now need the matching role on the
 * user (the "also works as" ticks), so give today's store admins the same
 * three, and nothing changes on deploy. Untick them on the user afterwards.
 */
return new class extends Migration
{
    private const ROLES = ['seller', 'store_manager', 'stock_keeper'];

    public function up(): void
    {
        $roles = Role::query()->where('guard_name', 'web')->whereIn('name', self::ROLES)->pluck('name')->all();

        if ($roles === []) {
            return;
        }

        \App\Models\Auth\User::query()
            ->whereNotNull('store_id')
            ->role('admin')
            ->each(fn ($user) => $user->assignRole($roles));
    }

    public function down(): void
    {
        // Not reversible: it cannot tell a backfilled tick from one added by hand.
    }
};
