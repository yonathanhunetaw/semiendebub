<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets `users.role` hold `store_manager`.
 *
 * The column is an enum fixed at the roles that existed when the table was
 * created, so assigning the new store-manager role failed at the database — a
 * CHECK constraint violation on SQLite, a truncated value on MySQL. The role is
 * the one that rules on automated replenishment proposals, so it has to be
 * storable.
 *
 * Widened to a plain string rather than re-enumerated. Roles are defined in
 * `roles` (spatie/laravel-permission) and seeded by RolePermissionSeeder; naming
 * them a second time in a column constraint means every future role needs a
 * migration, which is exactly the trap this is paying off. `User::roleKey()`
 * remains the authority on what a role string means, and
 * `users:reconcile-roles` still keeps the column and the assignment in step.
 */
return new class extends Migration
{
    private const LEGACY_ROLES = [
        'admin', 'delivery', 'dev', 'finance', 'guest', 'marketing',
        'procurement', 'seller', 'shared', 'stock_keeper', 'vendor', 'user',
    ];

    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->string('role')->nullable()->change();
        });
    }

    public function down(): void
    {
        // Anything outside the original list would fail the restored enum, so it
        // goes back to NULL — the state the column has always permitted — rather
        // than blocking the rollback.
        \Illuminate\Support\Facades\DB::table('users')
            ->whereNotNull('role')
            ->whereNotIn('role', self::LEGACY_ROLES)
            ->update(['role' => null]);

        Schema::table('users', function (Blueprint $table): void {
            $table->enum('role', self::LEGACY_ROLES)->nullable()->change();
        });
    }
};
