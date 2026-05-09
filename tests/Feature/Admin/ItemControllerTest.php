<?php

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemPackagingType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class ItemControllerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Ensure we are NOT passing 'is_admin' here
        $admin = User::factory()->create([
            'role' => 'admin',
        ]);

        // If you use Spatie Roles, this is required for middleware
        if (method_exists($admin, 'assignRole')) {
            $admin->assignRole('admin');
        }

        $this->actingAs($admin);
    }

    #[Test]
    public function it_displays_the_items_list_via_inertia()
    {
        Item::factory()->count(3)->create();

        $response = $this->get(route('admin.items.index'));

        $response->assertStatus(200);
        $response->assertInertia(
            fn(Assert $page) => $page
                ->component('Admin/Items/Index')
                ->has('items')
                ->has('stores')
        );
    }

    /** @test */
    public function it_stores_a_new_item_and_resolves_category_from_string()
    {
        Storage::fake('public');

        $payload = [
            'product_name' => 'New Adventure Gear',
            'product_description' => 'Description goes here',
            'item_category_id' => 'New Category', // Testing your resolveCategoryId helper
            'status' => 'draft',
            'color_ids' => [],
            'size_ids' => [],
            'packaging' => [],
            'images' => [UploadedFile::fake()->image('main.jpg')]
        ];

        $response = $this->post(route('admin.items.store'), $payload);

        $this->assertDatabaseHas('items', ['product_name' => 'New Adventure Gear']);
        $this->assertDatabaseHas('item_categories', ['category_name' => 'New Category']);

        $item = Item::latest()->first();
        $response->assertRedirect(route('admin.items.edit', $item));
    }

    /** @test */
    public function it_updates_item_details_and_syncs_colors()
    {
        $item = Item::factory()->create();
        $color = ItemColor::factory()->create(['name' => 'Crimson']);

        $payload = [
            'product_name' => 'Updated Name',
            'item_category_id' => $item->item_category_id,
            'status' => 'draft',
            'color_ids' => [$color->id],
            // Sending existing images to test handleUploads logic
            'existing_images' => ['uploads/items/old_image.jpg']
        ];

        $response = $this->put(route('admin.items.update', $item), $payload);

        $response->assertRedirect(route('admin.items.edit', $item));
        $this->assertDatabaseHas('items', ['product_name' => 'Updated Name']);
        $this->assertTrue($item->colors->contains($color));
    }

    /** @test */
    public function it_forces_status_to_draft_if_variants_lack_required_images()
    {
        // Setup: Item with a variant that has 0 or 1 image
        $item = Item::factory()->create(['status' => 'draft']);
        $item->variants()->create([
            'sku' => 'SKU-INCOMPLETE',
            'images' => ['only-one-image.jpg'] // Needs 2 to be active
        ]);

        $payload = [
            'product_name' => $item->product_name,
            'item_category_id' => $item->item_category_id,
            'status' => 'active', // User tries to set it to active
        ];

        $this->put(route('admin.items.update', $item), $payload);

        // The evaluateDraftStatus helper should override 'active' back to 'draft'
        $this->assertEquals('draft', $item->fresh()->status);
        $this->assertTrue((bool) $item->fresh()->is_incomplete);
    }

    /** @test */
    public function it_can_permanently_delete_an_item()
    {
        $item = Item::factory()->create();

        $response = $this->delete(route('admin.items.destroy', $item));

        $response->assertRedirect(route('admin.items.index'));
        $this->assertDatabaseMissing('items', ['id' => $item->id]);
    }
}
