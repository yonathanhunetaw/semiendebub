<?php

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Store\Store;
use App\Models\Customer; // Ensure this matches your Customer model path
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

        // Create an admin user based on your Seeder logic
        $admin = User::factory()->create([
            'role' => 'admin',
        ]);

        // If you're using Spatie permissions, assign the role
        if (method_exists($admin, 'assignRole')) {
            $admin->assignRole('admin');
        }

        $this->actingAs($admin);
    }

    #[Test]
    public function it_displays_the_cart_create_page_with_required_data()
    {
        // 1. Prepare the data the controller expects to find
        Store::factory()->create(['name' => 'Main Store']);
        User::factory()->create(['role' => 'seller', 'first_name' => 'John']);
        // Assuming Customer factory exists
        Customer::factory()->create(['first_name' => 'Jane', 'last_name' => 'Doe']);

        // 2. Hit the route
        $response = $this->get(route('admin.carts.create'));

        // 3. Assertions
        $response->assertStatus(200);

        $response->assertInertia(fn (Assert $page) => $page
            ->component('Admin/Carts/Create') // Matches your Inertia::render path
            ->has('customers', 1)
            ->has('sellers', 1)
            ->has('stores', 1)
            // Check that the data structure matches your frontend interfaces
            ->where('stores.0.name', 'Main Store')
            ->where('sellers.0.role', null) // We only sent id, first_name, last_name
        );
    }
}
