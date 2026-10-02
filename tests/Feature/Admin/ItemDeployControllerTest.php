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
            // Deployed variants arrive active. They used to arrive inactive,
            // and `active` is what both seller catalogues filter on, so
            // "deploy" put the item in the store and left it invisible to the
            // store's own sellers until each row was switched on by hand.
            'active' => 1,
            'manual_status' => 'auto',
        ]);

        $this->post(route('admin.items.deploy', $item), ['store_id' => $store->id])
            ->assertRedirect()
            ->assertSessionHas('success', "All variants were already deployed to {$store->name}.");

        $this->assertDatabaseCount('store_variants', 1);
    }

    #[Test]
    public function it_deploys_a_variant_that_has_no_images(): void
    {
        /*
         * Deployment used to be refused unless every variant had two images or
         * a packaging type that PackagingPlaceholder could draw. A variant with
         * neither renders the placeholder's fallback, which is a truthful thing
         * to show, and the gate only meant an admin had to chase photographs
         * before a store could be given anything to sell.
         */
        $store = Store::factory()->create();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create([
            'item_id' => $item->id,
            'images' => [],
            'item_packaging_type_id' => null,
        ]);

        $this->post(route('admin.items.deploy', $item), ['store_id' => $store->id])
            ->assertRedirect()
            ->assertSessionHasNoErrors()
            ->assertSessionHas('success');

        $this->assertDatabaseHas('store_variants', [
            'item_variant_id' => $variant->id,
            'store_id' => $store->id,
            'active' => 1,
        ]);
    }

    #[Test]
    public function it_deploys_only_the_variants_a_store_is_missing(): void
    {
        $store = Store::factory()->create();
        $item = Item::factory()->create();
        $first = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->post(route('admin.items.deploy', $item), ['store_id' => $store->id]);

        // A colour added after the first deployment. The store holds one of
        // two variants, so it is not "already deployed".
        $second = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->post(route('admin.items.deploy', $item), ['store_id' => $store->id])
            ->assertSessionHas('success', "1 variant(s) deployed to {$store->name}. Set stock & price in Inventory.");

        $this->assertDatabaseCount('store_variants', 2);
        $this->assertDatabaseHas('store_variants', [
            'item_variant_id' => $second->id,
            'store_id' => $store->id,
        ]);
    }
}
