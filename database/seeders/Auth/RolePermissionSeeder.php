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
        // add more permissions as needed

        // Create roles and assign permissions
        $admin = Role::firstOrCreate(['name' => 'admin']);
        $admin->givePermissionTo(Permission::all());

        $seller = Role::firstOrCreate(['name' => 'seller']);
        $seller->givePermissionTo(['view dashboard']);

        $stockKeeper = Role::firstOrCreate(['name' => 'stock_keeper']);
        $stockKeeper->givePermissionTo(['view dashboard']);

        $user = Role::firstOrCreate(['name' => 'user']);
        $user->givePermissionTo([]); // Users may have no special permissions initially
    }
}
