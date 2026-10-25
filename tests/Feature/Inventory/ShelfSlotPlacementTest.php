<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\Inventory\ShelfItemBand;
use App\Models\Item\Item;
use App\Services\Inventory\ShelfSlots;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/** A shelf bin can be put on one slot of the racks (f6c); the Guide world's racks view uses the same routes. */
class ShelfSlotPlacementTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private Item $second;

    protected function setUp(): void
    {
        parent::setUp();

        $this->setUpSetupItem();
        $this->second = Item::factory()->create(['product_name' => 'Aardvark Pad', 'item_category_id' => $this->item->item_category_id]);
        foreach ([$this->item, $this->second] as $item) {
            ShelfItemBand::query()->create(['stock_location_id' => $this->shelf()->id, 'item_id' => $item->id, 'max_units' => 100, 'refill_units' => 30, 'critical_units' => 10]);
        }
    }

    private function placeOn(Item $item, ?string $slot)
    {
        return $this->actingAs($this->admin)->put(route('admin.items.setup.spot', ['item' => $item->id, 'location' => $this->shelf()->id]), ['spot' => $slot]);
    }

    private function spotOf(Item $item): ?string
    {
        return ShelfItemBand::query()->where('stock_location_id', $this->shelf()->id)->where('item_id', $item->id)->value('spot');
    }

    #[Test]
    public function the_racks_have_sixty_nine_spots_of_four_slots(): void
    {
        $this->assertCount(69 * 4, ShelfSlots::all());
        $this->assertSame('f6c', ShelfSlots::normalise(' F6C '));
        foreach (['a7a', 'i4a', 'p1a', 'f6e', 'f0a', 'f6', '', 'ff6a'] as $bad) {
            $this->assertNull(ShelfSlots::normalise($bad), $bad);
        }
    }

    #[Test]
    public function an_item_goes_on_a_slot_and_the_world_feed_says_where(): void
    {
        $this->placeOn($this->item, 'f6c')->assertSessionHas('success');
        $this->assertSame('f6c', $this->spotOf($this->item));
        $this->assertNull($this->spotOf($this->second), 'the other bin is not placed');

        $feed = $this->actingAs($this->admin)->getJson(route('admin.guide.world', ['from' => '2026-10-14', 'shelf' => 1]))->assertOk();
        $feed->assertJsonPath('shelf_edit.can_place', true)->assertJsonPath('shelf_edit.location_id', $this->shelf()->id);
        $byName = collect($feed->json('shelf'))->keyBy('name');
        $this->assertSame('f6c', $byName[$this->item->product_name]['spot']);
        $this->assertNull($byName['Aardvark Pad']['spot']);
    }

    #[Test]
    public function a_taken_slot_swaps_and_a_slot_holds_one_item(): void
    {
        $this->placeOn($this->item, 'a1a');
        $this->placeOn($this->second, 'b2b');

        // the second item goes to the first's slot: they trade places
        $this->placeOn($this->second, 'a1a')->assertSessionHas('success', fn (string $m): bool => str_contains($m, 'took its old place'));
        $this->assertSame('a1a', $this->spotOf($this->second));
        $this->assertSame('b2b', $this->spotOf($this->item));

        // an unplaced item takes a held slot: the holder is left unplaced
        $third = Item::factory()->create(['product_name' => 'Zebra Pad', 'item_category_id' => $this->item->item_category_id]);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf()->id, 'item_id' => $third->id, 'max_units' => 50, 'refill_units' => 20, 'critical_units' => 5]);
        $this->placeOn($third, 'a1a');
        $this->assertSame('a1a', $this->spotOf($third));
        $this->assertNull($this->spotOf($this->second));

        $this->assertSame(
            ShelfItemBand::query()->whereNotNull('spot')->pluck('spot')->count(),
            ShelfItemBand::query()->whereNotNull('spot')->pluck('spot')->unique()->count(),
            'no slot is held twice',
        );
    }

    #[Test]
    public function a_slot_that_does_not_exist_or_an_item_with_no_bin_changes_nothing(): void
    {
        foreach (['z9z', 'a7a', 'i4a', 'f6e'] as $bad) {
            $this->placeOn($this->item, $bad)->assertSessionHasErrors('spot');
            $this->assertNull($this->spotOf($this->item), $bad);
        }

        $loose = Item::factory()->create(['product_name' => 'Loose Pen', 'item_category_id' => $this->item->item_category_id]);
        $this->placeOn($loose, 'a1a')->assertSessionHasErrors('spot');
        $this->assertSame(0, ShelfItemBand::query()->whereNotNull('spot')->count());
    }

    #[Test]
    public function an_empty_slot_lifts_the_bin_off_but_keeps_it_on_the_shelf(): void
    {
        $this->placeOn($this->item, 'c3d');
        $this->placeOn($this->item, null)->assertSessionHas('success');

        $this->assertNull($this->spotOf($this->item));
        $this->assertNotNull(ShelfItemBand::query()->where('stock_location_id', $this->shelf()->id)->where('item_id', $this->item->id)->first(), 'still has its limits');
    }

    #[Test]
    public function only_who_may_edit_the_planogram_can_place_and_only_the_admin_and_seller_apps_offer_it(): void
    {
        $seller = $this->makeUser('seller', $this->store->id);
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($seller)->put(route('seller.locations.bands.spot', ['location' => $this->shelf()->id, 'item' => $this->item->id]), ['spot' => 'a1a'])->assertForbidden();
        $this->assertNull($this->spotOf($this->item));

        $this->actingAs($seller)->getJson(route('seller.guide.world', ['from' => '2026-10-14', 'shelf' => 1]))->assertOk()->assertJsonPath('shelf_edit.can_place', false);

        // the stock keeper's app has no such route at all
        $this->assertFalse(\Illuminate\Support\Facades\Route::has('stock_keeper.locations.bands.spot'));
    }
}
