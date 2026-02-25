<?php

namespace Database\Seeders\Auth;

use App\Models\Auth\UserManagement;
use Illuminate\Database\Seeder;

class UserManagementSeeder extends Seeder
{
    public function run(): void
    {
        UserManagement::factory(10)->create();
    }
}
