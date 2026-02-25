<?php

namespace Database\Seeders\Auth;

use App\Models\Auth\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class UserSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $yonathan = User::create([
            'first_name' => 'Yonathan',
            'last_name' => 'Hunetaw',
            'phone_number' => '1284587890',
            'email' => 'yo@yo.com',
            'email_verified_at' => now(),
            'role' => 'admin',
            'password' => Hash::make('12345678'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $yonathan->assignRole('admin');

        $users = [
            [
                'first_name' => 'Mili',
                'last_name' => 'Hunetaw',
                'phone_number' => '0912344867',
                'email' => 'mili.hunetaw@gmail.com',
                'email_verified_at' => now(),
                'role' => 'admin',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                'store_id' => null,  // add null if not applicable
                'inventory_location_id' => null, // add null if not applicable
                'created_at' => now(),
                'created_by' => $yonathan->id, // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
                // Admin does NOT need store_id or inventory_location_id
            ],
            [
                'first_name' => 'Sultan',
                'last_name' => 'Sultan',
                'phone_number' => '0914344567',
                'email' => 'su@gmail.com',
                'email_verified_at' => now(),
                'role' => 'stock_keeper',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                'store_id' => null,
                'inventory_location_id' => 1, // stock keeper is tied to a location
                'created_at' => now(),
                'created_by' => $yonathan->id, // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
            ],
            [
                'first_name' => 'Amen',
                'last_name' => 'Biniyam',
                'phone_number' => '0914344267',
                'email' => 'amen@gmail.com',
                'email_verified_at' => now(),
                'role' => 'user',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                // No store_id or inventory_location_id but then why not
                'store_id' => 3, // <-- needed to see stock of store online store 1 being main store, 2 second store and assuming that 3 is online_store
                'inventory_location_id' => 1,
                'created_at' => now(),
                'created_by' => $yonathan->id, // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
            ],
            [
                'first_name' => 'Admin',
                'last_name' => 'User',
                'phone_number' => '0943754832',
                'email' => 'admin@admin.com',
                'email_verified_at' => now(),
                'role' => 'admin',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                'store_id' => null,  // add null if not applicable
                'inventory_location_id' => null, // add null if not applicable
                'created_at' => now(),
                'created_by' => $yonathan->id, // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
                // Admin does NOT need store_id or inventory_location_id
            ],
            [
                'first_name' => 'Seller',
                'last_name' => 'User',
                'phone_number' => '0947278489',
                'email' => 'seller@seller.com',
                'email_verified_at' => now(),
                'role' => 'seller',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                // Admin does NOT need store_id or inventory_location_id
                'store_id' => 1, // seller is tied to a store
                'inventory_location_id' => 1,
                'created_at' => now(),
                'created_by' => $yonathan->id, // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
            ],
            [
                'first_name' => 'Stoke_keeper',
                'last_name' => 'User',
                'phone_number' => '0911239154',
                'email' => 'stockkeeper@stockkeeper.com',
                'email_verified_at' => now(),
                'role' => 'stock_keeper',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                'store_id' => null,
                'inventory_location_id' => 2, // stock keeper is tied to a location
                'created_at' => now(),
                'created_by' => $yonathan->id,  // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
            ],
            [
                'first_name' => 'User',
                'last_name' => 'User',
                'phone_number' => '0953827843',
                'email' => 'user@user.com',
                'email_verified_at' => now(),
                'role' => 'user',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                'store_id' => 3, // <-- needed to see stock of store online store 1 being main store, 2 second store and assuming that 3 is online_store
                'inventory_location_id' => null,
                'created_at' => now(),
                'created_by' => $yonathan->id, // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
            ],
            [
                'first_name' => 'Seller 2',
                'last_name' => 'Seller 2',
                'phone_number' => '0953877893',
                'email' => 'seller2@seller2.com',
                'email_verified_at' => now(),
                'role' => 'seller',
                'password' => Hash::make('12345678'),
                'remember_token' => Str::random(10),
                'store_id' => 2, // <-- needed to see stock of store online store 1 being main store, 2 second store and assuming that 3 is online_store
                'inventory_location_id' => null,
                'created_at' => now(),
                'created_by' => $yonathan->id, // Assuming user with ID 1 is creating the record
                'updated_at' => now(),
            ],
            // There is also a visitor which i different from a user (a user is someone that had signed up).
            // You can add more users as needed
        ];

        foreach ($users as $data) {
            $role = $data['role'];
            unset($data['role']); // remove role before insert
            $user = User::create(array_merge($data, [
                'password' => Hash::make('12345678'),
                'email_verified_at' => now(),
                'remember_token' => Str::random(10),
            ]));
            $user->assignRole($role); // ✅ assign Spatie role
        }

        // Factory users
        User::factory(10)->create()->each(function ($user) {
            $user->assignRole('user'); // default role
        });

    }
}
