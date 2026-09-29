<?php

namespace Tests;

use Database\Seeders\Auth\RolePermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Spatie\Permission\PermissionRegistrar;

abstract class TestCase extends BaseTestCase
{
    /**
     * Seed the role/permission table for every test that uses a database.
     *
     * The app's roles are fixed domain data declared in config/subdomains.php,
     * and Spatie throws RoleDoesNotExist on assignRole() when the row is
     * absent. Tests were each expected to remember a Role::firstOrCreate()
     * first, and the ones that forgot failed for that reason alone rather than
     * for anything they were actually asserting.
     */
    protected function setUp(): void
    {
        parent::setUp();

        if (in_array(RefreshDatabase::class, class_uses_recursive(static::class), true)) {
            $this->seed(RolePermissionSeeder::class);

            // Spatie caches the lookup; without this the freshly seeded roles
            // are invisible to the very test that just seeded them.
            app(PermissionRegistrar::class)->forgetCachedPermissions();
        }
    }
}
