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
        Permission::firstOrCreate(['name' => 'view dashboard']);
        Permission::firstOrCreate(['name' => 'view delivery']);
        Permission::firstOrCreate(['name' => 'view finance']);
        Permission::firstOrCreate(['name' => 'view guest']);
        Permission::firstOrCreate(['name' => 'view marketing']);
        Permission::firstOrCreate(['name' => 'view procurement']);
        Permission::firstOrCreate(['name' => 'view shared']);
        Permission::firstOrCreate(['name' => 'view vendor']);

        // Create roles and assign permissions
        $admin = Role::firstOrCreate(['name' => 'admin']);
        $admin->givePermissionTo(Permission::all());

        $delivery = Role::firstOrCreate(['name' => 'delivery']);
        $delivery->givePermissionTo(['view delivery']);

        $finance = Role::firstOrCreate(['name' => 'finance']);
        $finance->givePermissionTo(['view finance']);

        $guest = Role::firstOrCreate(['name' => 'guest']);
        $guest->givePermissionTo(['view guest']);

        $marketing = Role::firstOrCreate(['name' => 'marketing']);
        $marketing->givePermissionTo(['view marketing']);

        $procurement = Role::firstOrCreate(['name' => 'procurement']);
        $procurement->givePermissionTo(['view procurement']);

        $seller = Role::firstOrCreate(['name' => 'seller']);
        $seller->givePermissionTo(['view dashboard']);

        $shared = Role::firstOrCreate(['name' => 'shared']);
        $shared->givePermissionTo(['view shared']);

        $stockKeeper = Role::firstOrCreate(['name' => 'stock_keeper']);
        $stockKeeper->givePermissionTo(['view dashboard']);

        $vendor = Role::firstOrCreate(['name' => 'vendor']);
        $vendor->givePermissionTo(['view vendor']);

        $user = Role::firstOrCreate(['name' => 'user']);
        $user->givePermissionTo([]); // Users may have no special permissions initially
    }
}
