<?php

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemPackagingType;
use App\Models\Store\Store;
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
            \Spatie\Permission\Models\Role::firstOrCreate(['name' => 'admin', 'guard_name' => 'web']);
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
                ->has('items.data', 3)
                ->has('categories')
                ->where('counts.all', 3)
                ->where('filters.status', 'all')
        );
    }

    #[Test]
    public function it_searches_items_by_name_and_variant_sku()
    {
        Item::factory()->create(['product_name' => 'Blue Kettle']);
        $mug = Item::factory()->create(['product_name' => 'Tea Mug']);
        $mug->variants()->create(['sku' => 'MUG-RED-01']);
        Item::factory()->create(['product_name' => 'Spoon']);

        $this->get(route('admin.items.index', ['q' => 'kettle']))
            ->assertInertia(fn (Assert $page) => $page
                ->has('items.data', 1)
                ->where('items.data.0.product_name', 'Blue Kettle')
                ->where('counts.all', 1));

        $this->get(route('admin.items.index', ['q' => 'MUG-RED']))
            ->assertInertia(fn (Assert $page) => $page
                ->has('items.data', 1)
                ->where('items.data.0.id', $mug->id)
                ->where('items.data.0.variants_count', 1));
    }

    #[Test]
    public function it_filters_by_status_and_counts_every_status_tab()
    {
        Item::factory()->count(2)->create(['status' => 'active']);
        Item::factory()->create(['status' => 'draft', 'is_incomplete' => true]);

        $this->get(route('admin.items.index', ['status' => 'draft']))
            ->assertInertia(fn (Assert $page) => $page
                ->has('items.data', 1)
                ->where('items.data.0.is_incomplete', true)
                ->where('counts.all', 3)
                ->where('counts.active', 2)
                ->where('counts.draft', 1)
                ->where('counts.needs_photos', 1));

        // The old `filter` key and junk sort values still load the page.
        $this->get(route('admin.items.index', ['filter' => 'active', 'sort' => 'nope', 'per_page' => 7]))
            ->assertInertia(fn (Assert $page) => $page
                ->has('items.data', 2)
                ->where('filters.sort', 'name')
                ->where('filters.per_page', 25));
    }

    #[Test]
    public function it_sets_one_status_on_several_items()
    {
        $items = Item::factory()->count(3)->create(['status' => 'draft']);
        $untouched = Item::factory()->create(['status' => 'draft']);

        $this->patch(route('admin.items.bulkStatus'), [
            'ids' => $items->pluck('id')->all(),
            'status' => 'archived',
        ])->assertSessionHasNoErrors()->assertSessionHas('success');

        $items->each(fn (Item $item) => $this->assertSame('archived', $item->fresh()->status));
        $this->assertSame('draft', $untouched->fresh()->status);

        $this->patch(route('admin.items.bulkStatus'), ['ids' => [], 'status' => 'active'])
            ->assertSessionHasErrors('ids');
    }

    #[Test]
    public function it_sends_selected_options_and_variant_keys_to_the_edit_form()
    {
        config()->set('filesystems.disks.r2.url', 'https://images.example.test');
        $item = Item::factory()->create();
        $color = ItemColor::factory()->create(['name' => 'Crimson']);
        $size = ItemSize::factory()->create(['name' => 'Large']);
        $packagingType = ItemPackagingType::factory()->create(['name' => 'Carton']);

        $item->colors()->attach($color->id);
        $item->sizes()->attach($size->id);
        $item->packagingTypes()->attach($packagingType->id, ['quantity' => 48]);

        $variant = $item->variants()->create([
            'item_color_id' => $color->id,
            'item_size_id' => $size->id,
            'item_packaging_type_id' => $packagingType->id,
            'sku' => 'CRIMSON-LARGE-CARTON',
            'images' => ['uploads/variants/carton.jpg'],
        ]);

        $this->get(route('admin.items.edit', $item))
            ->assertInertia(fn (Assert $page) => $page
                ->component('Admin/Items/Edit')
                ->where('item.colors.0.id', $color->id)
                ->where('item.sizes.0.id', $size->id)
                ->where('item.packagingTypes.0.id', $packagingType->id)
                ->where('item.packagingTypes.0.pivot.quantity', 48)
                ->where('item.variants.0.id', $variant->id)
                ->where('item.variants.0.item_color_id', $color->id)
                ->where('item.variants.0.item_size_id', $size->id)
                ->where('item.variants.0.item_packaging_type_id', $packagingType->id)
                ->where('item.variants.0.image_urls.0', 'https://images.example.test/uploads/variants/carton.jpg')
            );
    }

    #[Test]
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
        $response->assertRedirect(route('admin.items.show', $item));
    }

    #[Test]
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

    #[Test]
    public function it_persists_cleared_variant_image_slots(): void
    {
        Store::factory()->create();
        $item = Item::factory()->create();
        $color = ItemColor::factory()->create();
        $size = ItemSize::factory()->create();
        $packagingType = ItemPackagingType::factory()->create();
        $item->colors()->attach($color->id);
        $item->sizes()->attach($size->id);
        $item->packagingTypes()->attach($packagingType->id, ['quantity' => 1]);

        $variant = $item->variants()->create([
            'sku' => 'SLOT-TEST',
            'item_color_id' => $color->id,
            'item_size_id' => $size->id,
            'item_packaging_type_id' => $packagingType->id,
            'images' => [
                'uploads/variants/slot-1.jpg',
                'uploads/variants/slot-2.jpg',
                'uploads/variants/slot-3.jpg',
                'uploads/variants/slot-4.jpg',
                'uploads/variants/slot-5.jpg',
            ],
        ]);
        $key = "{$color->id}:{$size->id}:{$packagingType->id}";

        $this->patch(route('admin.items.update', $item), [
            'product_name' => $item->product_name,
            'item_category_id' => $item->item_category_id,
            'status' => 'draft',
            'color_ids' => [$color->id],
            'size_ids' => [$size->id],
            'packaging' => [[
                'item_packaging_type_id' => $packagingType->id,
                'quantity' => 1,
            ]],
            'variant_slot_keys' => [$key => 1],
            'variant_existing_images' => [$key => [0 => 'uploads/variants/slot-1.jpg']],
        ])->assertRedirect(route('admin.items.edit', $item));

        $this->assertSame([
            'uploads/variants/slot-1.jpg',
            null,
            null,
            null,
            null,
        ], $variant->fresh()->images);
    }

    #[Test]
    public function it_activates_an_item_whose_variants_lack_images_and_flags_it_as_incomplete()
    {
        /*
         * Thin imagery used to force the item back to `draft`. Draft items are
         * excluded by `Item::where('status', 'active')` in both
         * Seller\DashboardController and Seller\ItemController, so one
         * unphotographed variant removed the whole item from every seller's
         * catalogue — it looked deployed in admin and was simply absent.
         *
         * The admin's choice now stands, and `is_incomplete` carries the
         * "needs artwork" hint instead of hiding anything.
         */
        $color = ItemColor::factory()->create();
        $item = Item::factory()->create(['status' => 'draft']);
        $item->colors()->attach($color);
        $item->variants()->create([
            'sku' => 'SKU-INCOMPLETE',
            'item_color_id' => $color->id,
            // One image, and no packaging type to illustrate instead: this is
            // exactly the case the old gate refused.
            'images' => ['only-one-image.jpg'],
        ]);

        $payload = [
            'product_name' => $item->product_name,
            'item_category_id' => $item->item_category_id,
            'color_ids' => [$color->id],
            'status' => 'active',
        ];

        $this->put(route('admin.items.update', $item), $payload);

        $this->assertEquals('active', $item->fresh()->status);
        // Still recorded as thin, for the admin list's hint.
        $this->assertTrue((bool) $item->fresh()->is_incomplete);
    }

    #[Test]
    public function it_activates_an_item_through_the_status_endpoint_without_images()
    {
        $color = ItemColor::factory()->create();
        $item = Item::factory()->create(['status' => 'draft']);
        $item->colors()->attach($color);
        $item->variants()->create([
            'sku' => 'SKU-NO-ART',
            'item_color_id' => $color->id,
            'images' => [],
        ]);

        $this->patch(route('admin.items.updateStatus', $item), ['status' => 'active'])
            ->assertSessionHasNoErrors();

        $this->assertEquals('active', $item->fresh()->status);
        $this->assertTrue((bool) $item->fresh()->is_incomplete);
    }

    #[Test]
    public function it_clears_the_incomplete_flag_once_every_variant_is_illustrated()
    {
        $color = ItemColor::factory()->create();
        $item = Item::factory()->create(['status' => 'draft']);
        $item->colors()->attach($color);
        $item->variants()->create([
            'sku' => 'SKU-TWO-IMAGES',
            'item_color_id' => $color->id,
            'images' => ['one.jpg', 'two.jpg'],
        ]);

        $this->patch(route('admin.items.updateStatus', $item), ['status' => 'active']);

        $this->assertEquals('active', $item->fresh()->status);
        $this->assertFalse((bool) $item->fresh()->is_incomplete);
    }

    #[Test]
    public function it_can_permanently_delete_an_item()
    {
        $item = Item::factory()->create();

        $response = $this->delete(route('admin.items.destroy', $item));

        $response->assertRedirect(route('admin.items.index'));
        $this->assertDatabaseMissing('items', ['id' => $item->id]);
    }
}
