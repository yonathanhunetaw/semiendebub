<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Making an item and editing its basics and pictures on the setup page. */
class ItemSetupBasicsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Storage::fake('r2');
        Role::firstOrCreate(['name' => 'admin']);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $admin = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $admin->assignRole('admin');
        $this->actingAs($admin);
    }

    #[Test]
    public function a_new_item_is_made_from_its_basics_and_lands_on_its_setup_page(): void
    {
        $category = ItemCategory::factory()->create();

        $response = $this->post(route('admin.items.setup.store'), [
            'product_name' => 'Fresh Pencil', 'product_description' => 'HB', 'packaging_details' => '12 per box',
            'item_category_id' => $category->id, 'status' => 'draft',
        ]);

        $item = Item::query()->where('product_name', 'Fresh Pencil')->sole();
        $response->assertRedirect(route('admin.items.setup', $item));
        $this->assertSame($category->id, (int) $item->item_category_id);
        $this->assertSame('draft', $item->status);
        $this->assertSame('HB', $item->product_description);
    }

    #[Test]
    public function a_category_typed_as_a_new_name_is_created_on_the_spot(): void
    {
        $this->post(route('admin.items.setup.store'), ['product_name' => 'X', 'item_category_id' => 'Brand New Category', 'status' => 'draft']);

        $this->assertSame(1, ItemCategory::query()->where('category_name', 'Brand New Category')->count());
        $this->assertNotNull(Item::query()->where('product_name', 'X')->value('item_category_id'));
    }

    #[Test]
    public function a_name_and_a_category_are_required(): void
    {
        $this->post(route('admin.items.setup.store'), ['status' => 'draft'])->assertSessionHasErrors(['product_name', 'item_category_id']);
        $this->assertSame(0, Item::query()->count());
    }

    #[Test]
    public function the_basics_are_saved_without_touching_the_options_or_variants(): void
    {
        $item = Item::factory()->create(['product_name' => 'Old', 'status' => 'draft']);
        $color = \App\Models\Item\ItemColor::factory()->create();
        $item->colors()->attach($color->id);
        $category = ItemCategory::factory()->create();

        $this->put(route('admin.items.setup.basics', $item), [
            'product_name' => 'New name', 'product_description' => 'Better', 'packaging_details' => null,
            'item_category_id' => $category->id, 'status' => 'active',
        ])->assertRedirect()->assertSessionHas('success');

        $item->refresh();
        $this->assertSame('New name', $item->product_name);
        $this->assertSame('active', $item->status);
        $this->assertSame($category->id, (int) $item->item_category_id);
        $this->assertSame([$color->id], $item->colors()->pluck('item_colors.id')->all(), 'the colours are still there');
    }

    #[Test]
    public function pictures_are_added_one_by_one_up_to_ten_and_removed_by_path(): void
    {
        $item = Item::factory()->create(['general_images' => []]);

        $this->post(route('admin.items.setup.pictures.store', $item), ['image' => UploadedFile::fake()->image('a.jpg')])->assertRedirect();
        $path = $item->fresh()->general_images[0];
        Storage::disk('r2')->assertExists($path);

        $this->delete(route('admin.items.setup.pictures.destroy', $item), ['path' => $path])->assertRedirect();
        $this->assertSame([], $item->fresh()->general_images);
        Storage::disk('r2')->assertMissing($path);

        $this->delete(route('admin.items.setup.pictures.destroy', $item), ['path' => 'uploads/items/not-mine.jpg'])->assertNotFound();

        $item->update(['general_images' => array_map(fn ($i) => "uploads/items/{$i}.jpg", range(1, 10))]);
        $this->post(route('admin.items.setup.pictures.store', $item), ['image' => UploadedFile::fake()->image('b.jpg')])->assertSessionHasErrors('image');
    }

    #[Test]
    public function a_removed_picture_another_item_still_shows_keeps_its_file(): void
    {
        Storage::disk('r2')->put('uploads/items/shared.jpg', 'x');
        $item = Item::factory()->create(['general_images' => ['uploads/items/shared.jpg']]);
        Item::factory()->create(['general_images' => ['uploads/items/shared.jpg']]);

        $this->delete(route('admin.items.setup.pictures.destroy', $item), ['path' => 'uploads/items/shared.jpg'])->assertRedirect();

        $this->assertSame([], $item->fresh()->general_images);
        Storage::disk('r2')->assertExists('uploads/items/shared.jpg');
    }

    #[Test]
    public function an_item_can_be_deleted_from_the_page(): void
    {
        $item = Item::factory()->create();

        $this->delete(route('admin.items.destroy', $item))->assertRedirect(route('admin.items.index'));
        $this->assertNull(Item::query()->find($item->id));
    }

    #[Test]
    public function a_new_category_can_sit_under_another_one(): void
    {
        $parent = ItemCategory::factory()->create(['category_name' => 'Writing Tools']);

        $this->postJson(route('admin.items.inline-options'), ['type' => 'category', 'name' => 'Gel Pens', 'parent_id' => $parent->id])->assertOk();

        $this->assertSame($parent->id, (int) ItemCategory::query()->where('category_name', 'Gel Pens')->value('parent_id'));
    }

    // ---- readiness on the list -----------------------------------------------------

    #[Test]
    public function opening_an_items_setup_page_remembers_its_percentage_for_the_list(): void
    {
        $item = Item::factory()->create(['readiness_percent' => null]);

        $this->get(route('admin.items.setup', $item))->assertOk();

        $this->assertNotNull($item->fresh()->readiness_percent);
        $this->get(route('admin.items.index'))->assertInertia(fn ($page) => $page->where('items.data.0.readiness_percent', $item->fresh()->readiness_percent));
    }

    #[Test]
    public function the_refresh_command_fills_every_items_percentage_and_the_not_ready_filter_uses_it(): void
    {
        $a = Item::factory()->create(['product_name' => 'A', 'readiness_percent' => null]);
        $b = Item::factory()->create(['product_name' => 'B', 'readiness_percent' => 100]);

        $this->artisan('items:refresh-readiness')->assertSuccessful();

        $this->assertNotNull($a->fresh()->readiness_percent);
        $this->assertLessThan(100, $a->fresh()->readiness_percent, 'an item with no variants or store is not ready');

        $this->get(route('admin.items.index', ['not_ready' => 1]))->assertOk()
            ->assertInertia(fn ($page) => $page->has('items.data')->where('counts.not_ready', fn ($n) => $n >= 1));
        $this->assertNotNull($b->fresh());
    }

    #[Test]
    public function the_list_sorts_least_ready_first(): void
    {
        Item::factory()->create(['product_name' => 'Ready one', 'readiness_percent' => 100]);
        Item::factory()->create(['product_name' => 'Half ready', 'readiness_percent' => 50]);

        $this->get(route('admin.items.index', ['sort' => 'ready', 'direction' => 'asc']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('items.data.0.product_name', 'Half ready'));
    }
}
