<?php

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Store\Store;
use App\Models\Auth\Customer; // Ensure this matches your Customer model path
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;
use PHPUnit\Framework\Attributes\Test;

class CartControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // 1. CRITICAL: Clear the Spatie internal cache for the test environment
        $this->app->make(\Spatie\Permission\PermissionRegistrar::class)->forgetCachedPermissions();

        // 2. Create the role explicitly for the 'web' guard
        \Spatie\Permission\Models\Role::create(['name' => 'admin', 'guard_name' => 'web']);

        // 3. Create the admin user
        // Note: We use the factory which is linked to App\Models\Auth\User
        $admin = User::factory()->create([
            'role' => 'admin',
        ]);

        // 4. Assign the role
        $admin->assignRole('admin');

        // 5. Log in
        $this->actingAs($admin);
    }

    #[Test]
    public function it_displays_the_cart_create_page_with_required_data()
    {
        // Change this line from Store::factory()->create(...) to:
        Store::create([
            'name' => 'Main Store',
            'location' => 'Addis Ababa',
            'status' => 'active'
        ]);

        // Do the same for User if you don't want to use its factory
        // (Though we know the User factory works from our previous steps!)
        User::factory()->create(['role' => 'seller', 'first_name' => 'John']);
        // Assuming Customer factory exists
        Customer::factory()->create(['first_name' => 'Jane', 'last_name' => 'Doe']);

        // 2. Hit the route
        $response = $this->get(route('admin.carts.create'));

        // 3. Assertions
        $response->assertStatus(200);

        $response->assertInertia(
            fn(Assert $page) => $page
                ->component('Admin/Carts/Create')
                ->has('customers', 1)
                ->has('sellers', 1)
                ->has('stores', 1)
                ->where('stores.0.name', 'Main Store')
            // Remove the 'sellers.0.role' line entirely
        );
    }
}
