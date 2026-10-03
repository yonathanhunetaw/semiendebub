<?php

namespace Database\Seeders\Auth;

use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Permission;
use Spatie\Permission\Models\Role;
use Spatie\Permission\PermissionRegistrar;

class RolePermissionSeeder extends Seeder
{
    public function run(): void
    {
        // Reset cached roles & permissions
        app()[PermissionRegistrar::class]->forgetCachedPermissions();

        // Create permissions
        Permission::firstOrCreate(['name' => 'create users']);
        Permission::firstOrCreate(['name' => 'edit users']);
        Permission::firstOrCreate(['name' => 'delete users']);
        Permission::firstOrCreate(['name' => 'view admin dashboard']);
        Permission::firstOrCreate(['name' => 'view delivery dashboard']);
        Permission::firstOrCreate(['name' => 'view dev dashboard']);
        Permission::firstOrCreate(['name' => 'view finance dashboard']);
        Permission::firstOrCreate(['name' => 'view marketing dashboard']);
        Permission::firstOrCreate(['name' => 'view procurement dashboard']);
        Permission::firstOrCreate(['name' => 'view seller dashboard']);
        Permission::firstOrCreate(['name' => 'view shared']);
        Permission::firstOrCreate(['name' => 'view stockkeeper dashboard']);
        Permission::firstOrCreate(['name' => 'view vendor dashboard']);

        /*
         * Inventory capacity & replenishment.
         *
         * `approve replenishment transfers` is the authority the automated
         * planner's proposals wait on: a proposal is written unapproved and
         * cannot be dispatched until someone holding this rules on it. It is a
         * permission as well as a role so an admin can give a branch seller the
         * same authority without moving them off the seller subdomain.
         *
         * `oversee warehouse` is the network-wide view; being assigned to a
         * specific warehouse (facility_managers) is what grants rights over
         * *that* warehouse, and is checked by WarehousePolicy.
         */
        Permission::firstOrCreate(['name' => 'approve replenishment transfers']);
        Permission::firstOrCreate(['name' => 'manage location capacity']);
        Permission::firstOrCreate(['name' => 'oversee warehouse']);

        // Create roles and assign permissions
        $admin = Role::firstOrCreate(['name' => 'admin']);
        $admin->givePermissionTo(Permission::all());

        $delivery = Role::firstOrCreate(['name' => 'delivery']);
        $delivery->givePermissionTo(['view delivery dashboard']);

        $dev = Role::firstOrCreate(['name' => 'dev']);
        $dev->givePermissionTo(['view dev dashboard']);

        $finance = Role::firstOrCreate(['name' => 'finance']);
        $finance->givePermissionTo(['view finance dashboard']);

        $marketing = Role::firstOrCreate(['name' => 'marketing']);
        $marketing->givePermissionTo(['view marketing dashboard']);

        $procurement = Role::firstOrCreate(['name' => 'procurement']);
        $procurement->givePermissionTo(['view procurement dashboard']);

        $seller = Role::firstOrCreate(['name' => 'seller']);
        $seller->givePermissionTo(['view seller dashboard']);

        /*
         * Store manager — the role that rules on replenishment proposals.
         *
         * Not a subdomain of its own: a store manager works out of the store and
         * warehouse screens, and what they may act on is decided per facility by
         * the assignments in `facility_managers` plus the policies. The role
         * exists so the authority can be granted as a whole.
         */
        $storeManager = Role::firstOrCreate(['name' => 'store_manager']);
        $storeManager->givePermissionTo([
            'view seller dashboard',
            'view stockkeeper dashboard',
            'approve replenishment transfers',
            'manage location capacity',
            'oversee warehouse',
        ]);

        $shared = Role::firstOrCreate(['name' => 'shared']);
        $shared->givePermissionTo(['view shared']);

        $stock_Keeper = Role::firstOrCreate(['name' => 'stock_keeper']);
        $stock_Keeper->givePermissionTo(['view stockkeeper dashboard', 'oversee warehouse']);

        $vendor = Role::firstOrCreate(['name' => 'vendor']);
        $vendor->givePermissionTo(['view vendor dashboard']);

        $user = Role::firstOrCreate(['name' => 'user']);
        $user->givePermissionTo([]); // Users may have no special permissions initially
    }
}
