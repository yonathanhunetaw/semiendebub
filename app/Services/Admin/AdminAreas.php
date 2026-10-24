<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Auth\User;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\PermissionRegistrar;

/**
 * The parts of the global zone a global admin may tick on for one store admin
 * (users.store_id set): each is a Spatie permission `admin.area.<key>` given
 * to that user directly. A global admin has them all without ticks.
 *
 * Never on the list, so never a store admin's: other users, sessions and the
 * system status. Those stay behind a plain `admin.global`.
 */
final class AdminAreas
{
    /** @var array<string, string> key => what the tick says */
    public const AREAS = [
        'items' => 'Items: the catalogue, its setup and prices',
        'stores' => 'All stores: create, rename and delete stores',
        'warehouses' => 'Warehouses',
        'fleet' => 'Fleet: the vehicles',
        'purchase_orders' => 'Purchase orders: approve them',
        'import_costs' => 'Import costs: confirm them',
        'supplier_payments' => 'Supplier payments: confirm them',
        'expenses' => 'Expenses: confirm them',
    ];

    private const PREFIX = 'admin.area.';

    /** @return array<int, string> the areas this user may open (every one for a global admin) */
    public function grantedTo(?User $user): array
    {
        if ($user === null || ! $user->isRole('admin')) {
            return [];
        }

        if ($user->store_id === null) {
            return array_keys(self::AREAS);
        }

        return $user->permissions
            ->pluck('name')
            ->filter(fn (string $name): bool => str_starts_with($name, self::PREFIX))
            ->map(fn (string $name): string => substr($name, strlen(self::PREFIX)))
            ->filter(fn (string $key): bool => array_key_exists($key, self::AREAS))
            ->values()
            ->all();
    }

    public function allows(?User $user, string $area): bool
    {
        return in_array($area, $this->grantedTo($user), true);
    }

    /**
     * Set a store admin's ticks to exactly `$areas` (unknown keys dropped).
     * Anyone who is not a store admin keeps none.
     *
     * @param  array<int, string>  $areas
     */
    public function sync(User $user, array $areas): void
    {
        $wanted = $user->isRole('admin') && $user->store_id !== null
            ? array_values(array_intersect(array_keys(self::AREAS), $areas))
            : [];

        $keep = $user->permissions->reject(fn (Permission $p): bool => str_starts_with($p->name, self::PREFIX));
        $user->syncPermissions([
            ...$keep->all(),
            ...array_map(fn (string $key): Permission => Permission::findOrCreate(self::PREFIX.$key, 'web'), $wanted),
        ]);
        app(PermissionRegistrar::class)->forgetCachedPermissions();
        $user->unsetRelation('permissions');
    }
}
