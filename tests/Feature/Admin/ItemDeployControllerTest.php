<?php

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

class ItemDeployControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $admin = User::factory()->create(['role' => 'admin']);
        \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
        $admin->assignRole('admin');
        $this->actingAs($admin);
    }

    #[Test]
    public function it_deploys_variants_with_the_current_store_variant_schema(): void
    {
        $store = Store::factory()->create();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->post(route('admin.items.deploy', $item), ['store_id' => $store->id])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertDatabaseHas('store_variants', [
            'item_id' => $item->id,
            'item_variant_id' => $variant->id,
            'store_id' => $store->id,
            'stock' => 0,
            'active' => 0,
            'manual_status' => 'auto',
        ]);

        $this->post(route('admin.items.deploy', $item), ['store_id' => $store->id])
            ->assertRedirect()
            ->assertSessionHas('success', "All variants were already deployed to {$store->name}.");

        $this->assertDatabaseCount('store_variants', 1);
    }
}
