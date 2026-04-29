<?php

namespace Database\Seeders\User;

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
            'phone_number' => '1282587890',
            'email' => 'yonathan@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'admin',
            'password' => Hash::make('43295299'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $yonathan->assignRole('admin');

        $hulala = User::create([
            'first_name' => 'Hulala',
            'last_name' => 'Sinqe',
            'phone_number' => '0922135623',
            'email' => 'hulala@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'delivery',
            'password' => Hash::make('79230274'),
            'remember_token' => Str::random(10),
            'store_id' => 1,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $hulala->assignRole('delivery');

        $emp10 = User::create([
            'first_name' => 'Employee',
            'last_name' => 'Number 10',
            'phone_number' => '0972246474',
            'email' => 'emp10@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'dev',
            'password' => Hash::make('85652754'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $emp10->assignRole('dev');

        $gelila = User::create([
            'first_name' => 'Gelila',
            'last_name' => 'Mesfin',
            'phone_number' => '3525552343',
            'email' => 'gelila@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'seller',
            'password' => Hash::make('53267262'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => null,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $gelila->assignRole('finance');

        $guest = User::create([
            'first_name' => 'Guest',
            'last_name' => 'User',
            'phone_number' => '0972241474',
            'email' => 'guest@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'dev',
            'password' => Hash::make('97527534'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $guest->assignRole('guest');

        $henok = User::create([
            'first_name' => 'Henok',
            'last_name' => 'Godiso',
            'phone_number' => '0902246474',
            'email' => 'henok@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'marketing',
            'password' => Hash::make('65362453'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $henok->assignRole('marketing');

        $lili = User::create([
            'first_name' => 'Lili',
            'last_name' => 'Hungrily',
            'phone_number' => '0972206474',
            'email' => 'lili@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'procurement',
            'password' => Hash::make('97527534'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $lili->assignRole('procurement');

        $roman = User::create([
            'first_name' => 'Roman',
            'last_name' => 'Tofa',
            'phone_number' => '0972246874',
            'email' => 'roman@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'seller',
            'password' => Hash::make('97527534'),
            'remember_token' => Str::random(10),
            'store_id' => 1,
            'inventory_location_id' => 1,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $roman->assignRole('seller');

        $abebe = User::create([
            'first_name' => 'Abebe',
            'last_name' => 'Balcha',
            'phone_number' => '0772206474',
            'email' => 'abebe@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'dev',
            'password' => Hash::make('97527534'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $abebe->assignRole('shared');

        $sultan = User::create([
            'first_name' => 'Sultan',
            'last_name' => 'Sultan',
            'phone_number' => '0986323593',
            'email' => 'sultan@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'stock_keeper',
            'password' => Hash::make('97527534'),
            'remember_token' => Str::random(10),
            'store_id' => null,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $sultan->assignRole('stock_keeper');

        $alem = User::create([
            'first_name' => 'Alem',
            'last_name' => 'setgid',
            'phone_number' => '0994463386',
            'email' => 'alem@mezgebedirijit.com',
            'email_verified_at' => now(),
            'role' => 'vendor',
            'password' => Hash::make('75369643'),
            'remember_token' => Str::random(10),
            'store_id' => 2,
            'inventory_location_id' => null,
            'created_by' => 1,
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        $alem->assignRole('vendor');

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
