<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Admin → Items → an item: the gallery and each variant's five photo slots,
 * with empty slots kept in place so the editor can show which are free.
 */
class AdminItemShowImagesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config(['filesystems.disks.r2.url' => 'https://cdn.duka.test']);
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->actingAs($admin);
    }

    #[Test]
    public function the_item_page_resolves_the_gallery_and_keeps_empty_slots_in_place(): void
    {
        $item = Item::factory()->create(['general_images' => ['uploads/items/front.jpg', 'uploads/items/back.jpg']]);
        ItemVariant::factory()->create(['item_id' => $item->id, 'sku' => 'V-1', 'images' => ['uploads/variants/V-1/1.jpg', null, 'uploads/variants/V-1/3.jpg']]);

        $this->get(route('admin.items.show', $item))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Items/Show')
                ->where('item.general_images', ['https://cdn.duka.test/uploads/items/front.jpg', 'https://cdn.duka.test/uploads/items/back.jpg'])
                ->where('variantData.0.slot_count', 2)
                ->where('variantData.0.slots.0', ['path' => 'uploads/variants/V-1/1.jpg', 'url' => 'https://cdn.duka.test/uploads/variants/V-1/1.jpg'])
                ->where('variantData.0.slots.1', null)
                ->where('variantData.0.slots.2.url', 'https://cdn.duka.test/uploads/variants/V-1/3.jpg'));
    }

    #[Test]
    public function a_variant_without_photos_has_no_slots_and_all_image_urls_gives_the_placeholder(): void
    {
        $item = Item::factory()->create(['general_images' => []]);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id, 'images' => null]);

        $this->get(route('admin.items.show', $item))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('item.general_images', [])
                ->where('variantData.0.slot_count', 0)
                ->where('variantData.0.has_photos', false));

        $this->assertSame([asset('images/defaults/no-image.png')], $variant->all_image_urls);

        $variant->images = ['uploads/variants/a.jpg', '', 'uploads/variants/b.jpg'];
        $this->assertSame(['https://cdn.duka.test/uploads/variants/a.jpg', 'https://cdn.duka.test/uploads/variants/b.jpg'], $variant->all_image_urls);
    }
}
