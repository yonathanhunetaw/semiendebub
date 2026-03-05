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
        Permission::firstOrCreate(['name' => 'view guest dashboard']);
        Permission::firstOrCreate(['name' => 'view marketing dashboard']);
        Permission::firstOrCreate(['name' => 'view procurement dashboard']);
        Permission::firstOrCreate(['name' => 'view seller dashboard']);
        Permission::firstOrCreate(['name' => 'view shared']);
        Permission::firstOrCreate(['name' => 'view stockkeeper dashboard']);
        Permission::firstOrCreate(['name' => 'view vendor dashboard']);

        // Create roles and assign permissions
        $admin = Role::firstOrCreate(['name' => 'admin']);
        $admin->givePermissionTo(Permission::all());

        $delivery = Role::firstOrCreate(['name' => 'delivery']);
        $delivery->givePermissionTo(['view delivery dashboard']);

        $dev = Role::firstOrCreate(['name' => 'dev']);
        $dev->givePermissionTo(['view dev dashboard']);

        $finance = Role::firstOrCreate(['name' => 'finance']);
        $finance->givePermissionTo(['view finance dashboard']);

        $guest = Role::firstOrCreate(['name' => 'guest']);
        $guest->givePermissionTo(['view guest dashboard']);

        $marketing = Role::firstOrCreate(['name' => 'marketing']);
        $marketing->givePermissionTo(['view marketing dashboard']);

        $procurement = Role::firstOrCreate(['name' => 'procurement']);
        $procurement->givePermissionTo(['view procurement dashboard']);

        $seller = Role::firstOrCreate(['name' => 'seller']);
        $seller->givePermissionTo(['view seller dashboard']);

        $shared = Role::firstOrCreate(['name' => 'shared']);
        $shared->givePermissionTo(['view shared']);

        $stock_Keeper = Role::firstOrCreate(['name' => 'stock_keeper']);
        $stock_Keeper->givePermissionTo(['view stockkeeper dashboard']);

        $vendor = Role::firstOrCreate(['name' => 'vendor']);
        $vendor->givePermissionTo(['view vendor dashboard']);

        $user = Role::firstOrCreate(['name' => 'user']);
        $user->givePermissionTo([]); // Users may have no special permissions initially
    }
}
