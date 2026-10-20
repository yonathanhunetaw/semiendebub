<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemSize;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Admin → Items: photographs land on the r2 disk (item gallery and per-variant
 * slots), the gallery is capped at ten, and options typed by name are created.
 */
class ItemImageUploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('r2');
        Store::factory()->create();

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->actingAs($admin);
    }

    /** An item with one colour × size × packaging, so it has one variant. */
    private function itemWithVariant(): array
    {
        $item = Item::factory()->create(['product_name' => 'Wall Paint']);
        $color = ItemColor::factory()->create();
        $size = ItemSize::factory()->create();
        $packaging = ItemPackagingType::factory()->create();
        $item->colors()->attach($color->id);
        $item->sizes()->attach($size->id);
        $item->packagingTypes()->attach($packaging->id, ['quantity' => 1]);
        $variant = $item->variants()->create([
            'sku' => 'PAINT-1', 'item_color_id' => $color->id, 'item_size_id' => $size->id, 'item_packaging_type_id' => $packaging->id,
            'images' => ['uploads/variants/PAINT-1/old.jpg'],
        ]);

        return [$item, $variant, "{$color->id}:{$size->id}:{$packaging->id}", $color, $size, $packaging];
    }

    private function update(Item $item, ItemColor $color, ItemSize $size, ItemPackagingType $packaging, array $extra): \Illuminate\Testing\TestResponse
    {
        return $this->patch(route('admin.items.update', $item), $extra + [
            'product_name' => $item->product_name,
            'item_category_id' => $item->item_category_id,
            'status' => 'draft',
            'color_ids' => [$color->id],
            'size_ids' => [$size->id],
            'packaging' => [['item_packaging_type_id' => $packaging->id, 'quantity' => 1]],
        ]);
    }

    #[Test]
    public function gallery_images_are_stored_on_r2_after_the_ones_kept(): void
    {
        $response = $this->post(route('admin.items.store'), [
            'product_name' => 'Garden Hose',
            'item_category_id' => 'Garden',
            'status' => 'draft',
            'general_images' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.png')],
        ]);

        $item = Item::query()->where('product_name', 'Garden Hose')->sole();
        $response->assertRedirect(route('admin.items.setup', $item));

        $images = $item->general_images;
        $this->assertCount(2, $images);
        foreach ($images as $path) {
            $this->assertStringStartsWith('uploads/items/garden-hose_', $path);
            Storage::disk('r2')->assertExists($path);
        }
    }

    #[Test]
    public function the_gallery_is_capped_at_ten_images(): void
    {
        $this->post(route('admin.items.store'), [
            'product_name' => 'Too Many Photos',
            'item_category_id' => 'Garden',
            'status' => 'draft',
            'existing_images' => array_map(fn ($n) => "uploads/items/old_{$n}.jpg", range(1, 9)),
            'general_images' => [UploadedFile::fake()->image('a.jpg'), UploadedFile::fake()->image('b.jpg')],
        ])->assertSessionHasErrors('general_images');

        $this->assertSame(0, Item::query()->where('product_name', 'Too Many Photos')->count());
    }

    #[Test]
    public function a_new_photo_fills_its_variant_slot_beside_the_kept_ones(): void
    {
        [$item, $variant, $key, $color, $size, $packaging] = $this->itemWithVariant();

        $this->update($item, $color, $size, $packaging, [
            'variant_slot_keys' => [$key => 1],
            'variant_existing_images' => [$key => [0 => 'uploads/variants/PAINT-1/old.jpg']],
            'variant_images' => [$key => [2 => UploadedFile::fake()->image('side.webp')]],
        ])->assertRedirect(route('admin.items.setup', $item));

        $this->assertSame(
            ['uploads/variants/PAINT-1/old.jpg', null, 'uploads/variants/PAINT-1/PAINT-1_3.webp', null, null],
            $variant->fresh()->images,
        );
        Storage::disk('r2')->assertExists('uploads/variants/PAINT-1/PAINT-1_3.webp');
    }

    #[Test]
    public function a_variant_not_sent_in_the_form_keeps_its_photos(): void
    {
        [$item, $variant, , $color, $size, $packaging] = $this->itemWithVariant();

        $this->update($item, $color, $size, $packaging, [])->assertRedirect(route('admin.items.setup', $item));

        $this->assertSame(['uploads/variants/PAINT-1/old.jpg'], $variant->fresh()->images);
    }

    #[Test]
    public function a_single_photo_for_a_variant_replaces_its_images(): void
    {
        [$item, $variant, , $color, $size, $packaging] = $this->itemWithVariant();

        $this->update($item, $color, $size, $packaging, [
            "variant_image_{$variant->id}" => UploadedFile::fake()->image('main.png'),
        ])->assertRedirect(route('admin.items.setup', $item));

        $this->assertSame(['uploads/variants/PAINT-1/PAINT-1_main.png'], $variant->fresh()->images);
        Storage::disk('r2')->assertExists('uploads/variants/PAINT-1/PAINT-1_main.png');
    }

    #[Test]
    public function options_and_packaging_typed_by_name_are_created(): void
    {
        $this->post(route('admin.items.store'), [
            'product_name' => 'Rope',
            'item_category_id' => 'Hardware',
            'status' => 'draft',
            'color_ids' => ['Saffron'],
            'size_ids' => ['10 m'],
            'packaging' => [['item_packaging_type_id' => 'Coil', 'quantity' => 3]],
        ])->assertRedirect();

        $item = Item::query()->where('product_name', 'Rope')->sole();
        $this->assertSame(['Saffron'], $item->colors->pluck('name')->all());
        $this->assertSame(['10 m'], $item->sizes->pluck('name')->all());
        $coil = $item->packagingTypes->firstWhere('name', 'Coil');
        $this->assertNotNull($coil);
        $this->assertSame(3, (int) $coil->pivot->quantity);
    }
}
