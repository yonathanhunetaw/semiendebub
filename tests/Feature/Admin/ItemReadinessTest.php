<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\Stocktake;
use App\Models\Inventory\StocktakeLine;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Models\Store\StoreVariantIndividualPrice;
use App\Models\Store\StoreVariantSellerPrice;
use App\Services\Item\ItemDeployer;
use App\Services\Item\ItemReadiness;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/**
 * Every rule of App\Services\Item\ItemReadiness on its own: what each check wants, what the percentage does with
 * required and optional checks, and how stores add up.
 */
class ItemReadinessTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpSetupItem();
    }

    private function readiness(): array
    {
        return app(ItemReadiness::class)->for($this->item->fresh());
    }

    private function check(array $part, string $key): ?array
    {
        return collect($part['checks'])->firstWhere('key', $key);
    }

    private function storePart(?Store $store = null): array
    {
        return $this->readiness()['stores'][($store ?? $this->store)->id];
    }

    // ---- the percentage ------------------------------------------------------------

    #[Test]
    public function the_percentage_of_no_checks_is_zero(): void
    {
        $this->assertSame(0, app(ItemReadiness::class)->percent([]));
    }

    #[Test]
    public function only_optional_checks_done_make_a_hundred_and_undone_ones_change_nothing(): void
    {
        $r = app(ItemReadiness::class);
        $check = fn (bool $required, bool $done): array => ['key' => 'k', 'label' => 'l', 'required' => $required, 'done' => $done, 'detail' => ''];

        $this->assertSame(100, $r->percent([$check(false, true)]));
        $this->assertSame(0, $r->percent([$check(false, false)]), 'nothing required and nothing done: nothing to judge');
        $this->assertSame(50, $r->percent([$check(true, true), $check(true, false), $check(false, false)]), 'an undone optional never counts against');
        $this->assertSame(67, $r->percent([$check(true, true), $check(true, false), $check(false, true)]), '2 done of 3 counted');
        $this->assertSame(100, $r->percent([$check(true, true), $check(true, true), $check(false, false)]));
    }

    #[Test]
    public function the_baseline_item_misses_only_being_sold(): void
    {
        $r = $this->readiness();

        $this->assertSame(86, $r['item']['percent']);
        $this->assertSame(6, $r['item']['done_required']);
        $this->assertSame(7, $r['item']['required']);
        $this->assertSame(0, $r['item']['optional_done']);
        $this->assertSame([], $r['stores']);
    }

    // ---- each item check, broken in turn ----------------------------------------------

    /** @return array<string, array{0: string, 1: \Closure}> */
    public static function breakers(): array
    {
        return [
            'a blank name' => ['name', fn ($t) => $t->item->forceFill(['product_name' => '   '])->save()],
            'no category' => ['category', fn ($t) => $t->item->forceFill(['item_category_id' => null])->save()],
            'no pictures' => ['picture', fn ($t) => $t->item->forceFill(['general_images' => []])->save()],
            'only blank picture paths' => ['picture', fn ($t) => $t->item->forceFill(['general_images' => ['', '  ']])->save()],
            'null pictures' => ['picture', fn ($t) => $t->item->forceFill(['general_images' => null])->save()],
            'no variants' => ['variants', fn ($t) => $t->variant->delete()],
            'a variant without packaging' => ['packaging', fn ($t) => $t->variant->forceFill(['item_packaging_type_id' => null])->save()],
            'no variants (packaging)' => ['packaging', fn ($t) => $t->variant->delete()],
            'a missing barcode' => ['barcode', fn ($t) => $t->variant->forceFill(['barcode' => null])->save()],
            'a blank barcode' => ['barcode', fn ($t) => $t->variant->forceFill(['barcode' => '   '])->save()],
            'one variant of two without a barcode' => ['barcode', fn ($t) => ItemVariant::factory()->create(['item_id' => $t->item->id, 'barcode' => null, 'item_packaging_type_id' => $t->variant->item_packaging_type_id])],
        ];
    }

    #[Test]
    #[DataProvider('breakers')]
    public function a_required_item_check_turns_off_when_its_thing_is_broken(string $key, \Closure $break): void
    {
        $before = $this->readiness();
        $this->assertTrue($this->check($before['item'], $key)['done'], "{$key} starts done");

        $break($this);
        $after = $this->readiness();

        $this->assertFalse($this->check($after['item'], $key)['done']);
        $this->assertLessThan($before['item']['percent'], $after['item']['percent']);
        $this->assertTrue($this->check($after['item'], $key)['required']);
    }

    #[Test]
    public function the_description_is_optional_and_whitespace_does_not_count(): void
    {
        $this->item->forceFill(['description' => "  \n "])->save();
        $this->assertFalse($this->check($this->readiness()['item'], 'description')['done']);
        $this->assertFalse($this->check($this->readiness()['item'], 'description')['required']);

        $this->item->forceFill(['description' => 'Soft lead'])->save();
        $this->assertTrue($this->check($this->readiness()['item'], 'description')['done']);
    }

    #[Test]
    public function a_deleted_variant_is_not_counted_against_the_item(): void
    {
        $extra = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => null, 'item_packaging_type_id' => null]);
        $this->assertFalse($this->check($this->readiness()['item'], 'barcode')['done']);

        $extra->delete();

        $this->assertTrue($this->check($this->readiness()['item'], 'barcode')['done']);
        $this->assertTrue($this->check($this->readiness()['item'], 'packaging')['done']);
    }

    // ---- sold and deployed -----------------------------------------------------------------

    #[Test]
    public function sold_needs_an_active_store_variant_and_deployed_does_not(): void
    {
        app(ItemDeployer::class)->deploy($this->item, $this->store);

        $r = $this->readiness();
        $this->assertFalse($this->check($r['item'], 'sold')['done'], 'deployed but switched off');
        $this->assertTrue($this->check($r['stores'][$this->store->id], 'deployed')['done']);

        StoreVariant::query()->update(['active' => true]);
        $this->assertTrue($this->check($this->readiness()['item'], 'sold')['done']);
    }

    #[Test]
    public function deployed_needs_a_store_variant_for_every_variant_and_says_how_many(): void
    {
        $this->deployed();
        ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => '111111', 'item_packaging_type_id' => $this->variant->item_packaging_type_id]);

        $check = $this->check($this->storePart(), 'deployed');

        $this->assertFalse($check['done']);
        $this->assertSame('1 of 2 variants', $check['detail']);
    }

    #[Test]
    public function a_store_the_item_is_not_deployed_to_has_no_part(): void
    {
        $this->deployed();
        $other = Store::factory()->create(['name' => 'Second Store', 'status' => 'active']);

        $this->assertArrayHasKey($this->store->id, $this->readiness()['stores']);
        $this->assertArrayNotHasKey($other->id, $this->readiness()['stores']);
    }

    // ---- priced ---------------------------------------------------------------------------------

    /** @return array<string, array{0: mixed, 1: bool}> */
    public static function prices(): array
    {
        return [
            'no price at all' => [[], false],
            'a null price' => [['price' => null], false],
            'zero' => [['price' => 0], false],
            'zero as text' => [['price' => '0.00'], false],
            'words' => [['price' => 'free'], false],
            'a negative price' => [['price' => -5], false],
            'one cent' => [['price' => 0.01], true],
            'a price as text' => [['price' => '12.50'], true],
            'the list form the old code saved' => [[['price' => 5]], true],
            'the list form with zero' => [[['price' => 0]], false],
        ];
    }

    #[Test]
    #[DataProvider('prices')]
    public function a_store_price_counts_only_when_it_is_a_real_amount_above_zero(array $matrix, bool $priced): void
    {
        $this->deployed();
        StoreVariant::query()->update(['pricing_matrix' => $matrix]);

        $this->assertSame($priced, $this->check($this->storePart(), 'priced')['done']);
    }

    #[Test]
    public function every_variant_must_be_priced_and_the_detail_counts_them(): void
    {
        $this->deployed(10);
        $second = ItemVariant::factory()->create(['item_id' => $this->item->id, 'barcode' => '222222', 'item_packaging_type_id' => $this->variant->item_packaging_type_id]);
        app(ItemDeployer::class)->deploy($this->item->fresh(), $this->store);

        $check = $this->check($this->storePart(), 'priced');
        $this->assertFalse($check['done']);
        $this->assertSame('1 of 2 priced', $check['detail']);

        StoreVariant::query()->where('item_variant_id', $second->id)->update(['pricing_matrix' => ['price' => 3]]);
        $this->assertTrue($this->check($this->storePart(), 'priced')['done']);
    }

    // ---- the shelf bin ---------------------------------------------------------------------------------

    #[Test]
    public function the_bin_check_needs_a_band_with_a_real_maximum_on_this_stores_shelf_for_this_item(): void
    {
        $this->deployed();
        $this->assertFalse($this->check($this->storePart(), 'bin')['done']);

        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf()->id, 'item_id' => $this->item->id, 'max_units' => 0, 'refill_units' => 0, 'critical_units' => 0]);
        $this->assertFalse($this->check($this->storePart(), 'bin')['done'], 'a maximum of zero is no bin');

        ShelfItemBand::query()->update(['max_units' => 12, 'refill_units' => 4, 'critical_units' => 1]);
        $this->assertTrue($this->check($this->storePart(), 'bin')['done']);
    }

    #[Test]
    public function a_bin_on_another_shelf_or_for_another_item_does_not_count(): void
    {
        $this->deployed();
        $other = Store::factory()->create(['name' => 'Second Store', 'status' => 'active']);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf($other)->id, 'item_id' => $this->item->id, 'max_units' => 10, 'refill_units' => 3, 'critical_units' => 1]);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf()->id, 'item_id' => Item::factory()->create()->id, 'max_units' => 10, 'refill_units' => 3, 'critical_units' => 1]);

        $this->assertFalse($this->check($this->storePart(), 'bin')['done']);
    }

    #[Test]
    public function a_store_without_a_shelf_has_no_bin_check(): void
    {
        $this->deployed();
        $this->shelf()->delete();

        $this->assertNull($this->check($this->storePart(), 'bin'));
    }

    // ---- the count ---------------------------------------------------------------------------------------

    private function stocktake(string $status, ?Store $store = null, ?ItemVariant $variant = null, ?int $counted = 5): Stocktake
    {
        $take = Stocktake::query()->create([
            'reference' => 'ST-'.uniqid(), 'stock_location_id' => $this->floor($store)->id, 'status' => $status,
            'started_by' => $this->admin->id,
        ]);
        StocktakeLine::query()->create(['stocktake_id' => $take->id, 'item_variant_id' => ($variant ?? $this->variant)->id, 'expected' => 5, 'counted' => $counted]);

        return $take;
    }

    /** @return array<string, array{0: string, 1: bool}> */
    public static function countStatuses(): array
    {
        return [
            'posted' => [Stocktake::POSTED, true],
            'submitted' => [Stocktake::SUBMITTED, false],
            'still counting' => [Stocktake::COUNTING, false],
            'voided' => [Stocktake::VOIDED, false],
        ];
    }

    #[Test]
    #[DataProvider('countStatuses')]
    public function only_a_posted_count_makes_the_count_check(string $status, bool $done): void
    {
        $this->deployed();
        $this->stocktake($status);

        $this->assertSame($done, $this->check($this->storePart(), 'count')['done']);
    }

    #[Test]
    public function a_posted_count_of_a_line_nobody_counted_or_of_another_item_or_another_store_does_not_count(): void
    {
        $this->deployed();
        $other = Store::factory()->create(['name' => 'Second Store', 'status' => 'active']);

        $this->stocktake(Stocktake::POSTED, null, null, null);
        $this->assertFalse($this->check($this->storePart(), 'count')['done'], 'the line has no counted figure');

        $this->stocktake(Stocktake::POSTED, null, ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]));
        $this->assertFalse($this->check($this->storePart(), 'count')['done'], 'it counted another item');

        $this->stocktake(Stocktake::POSTED, $other);
        $this->assertFalse($this->check($this->storePart(), 'count')['done'], 'it counted another store');
    }

    #[Test]
    public function a_zero_count_is_a_count(): void
    {
        $this->deployed();
        $this->stocktake(Stocktake::POSTED, null, null, 0);

        $this->assertTrue($this->check($this->storePart(), 'count')['done']);
    }

    // ---- the optional store checks ------------------------------------------------------------------------

    #[Test]
    public function optional_store_checks_are_never_required(): void
    {
        $this->deployed();

        foreach (['individual', 'seller_prices', 'customer_prices', 'discount', 'pool', 'levels', 'route'] as $key) {
            $check = $this->check($this->storePart(), $key);
            $this->assertNotNull($check, $key);
            $this->assertFalse($check['required'], $key);
            $this->assertFalse($check['done'], $key);
        }
    }

    #[Test]
    public function an_active_individual_price_counts_and_an_inactive_one_does_not(): void
    {
        $row = $this->deployed();
        $price = StoreVariantIndividualPrice::query()->create(['store_variant_id' => $row->id, 'pricing_matrix' => ['price' => 8], 'active' => false]);
        $this->assertFalse($this->check($this->storePart(), 'individual')['done']);

        $price->update(['active' => true]);
        $this->assertTrue($this->check($this->storePart(), 'individual')['done']);
    }

    #[Test]
    public function seller_and_customer_prices_count_when_active(): void
    {
        $row = $this->deployed();
        $seller = $this->makeUser('seller', $this->store->id);
        StoreVariantSellerPrice::query()->create(['store_variant_id' => $row->id, 'seller_id' => $seller->id, 'pricing_matrix' => ['business' => ['price' => 9]], 'active' => true]);
        StoreVariantCustomerPrice::query()->create(['store_variant_id' => $row->id, 'customer_id' => Customer::factory()->create()->id, 'pricing_matrix' => ['price' => 9], 'active' => true]);

        $part = $this->storePart();
        $this->assertTrue($this->check($part, 'seller_prices')['done']);
        $this->assertTrue($this->check($part, 'customer_prices')['done']);
    }

    /** @return array<string, array{0: array<string, mixed>, 1: bool}> */
    public static function discounts(): array
    {
        return [
            'running with a future end' => [['discount_price' => 8, 'discount_ends_at' => '2099-01-01'], true],
            'running with no end date' => [['discount_price' => 8, 'discount_ends_at' => null], true],
            'ending today' => [['discount_price' => 8, 'discount_ends_at' => null, 'today' => true], true],
            'already over' => [['discount_price' => 8, 'discount_ends_at' => '2001-01-01'], false],
            'not below the price' => [['discount_price' => 10, 'discount_ends_at' => '2099-01-01'], false],
            'above the price' => [['discount_price' => 12, 'discount_ends_at' => '2099-01-01'], false],
            'zero' => [['discount_price' => 0, 'discount_ends_at' => '2099-01-01'], false],
            'none' => [['discount_price' => null, 'discount_ends_at' => null], false],
        ];
    }

    #[Test]
    #[DataProvider('discounts')]
    public function a_discount_counts_only_while_it_runs_and_is_below_the_price(array $discount, bool $done): void
    {
        $this->deployed(10);
        if (! empty($discount['today'])) {
            $discount['discount_ends_at'] = now()->toDateString();
            unset($discount['today']);
        }
        StoreVariant::query()->update(['pricing_matrix' => ['price' => 10] + $discount]);

        $this->assertSame($done, $this->check($this->storePart(), 'discount')['done']);
    }

    #[Test]
    public function a_business_pool_counts_only_above_zero(): void
    {
        $row = $this->deployed();

        $row->forceFill(['business_pool' => 0])->save();
        $this->assertFalse($this->check($this->storePart(), 'pool')['done']);

        $row->forceFill(['business_pool' => 5])->save();
        $this->assertTrue($this->check($this->storePart(), 'pool')['done']);
    }

    #[Test]
    public function levels_at_the_floor_or_the_remote_hub_count_and_the_route_counts_once_set(): void
    {
        $this->deployed();
        ShelfItemBand::query()->create(['stock_location_id' => $this->floor()->id, 'item_id' => $this->item->id, 'max_units' => 40, 'refill_units' => 10, 'critical_units' => 2]);
        ItemRefillRoute::query()->create(['store_id' => $this->store->id, 'item_id' => $this->item->id, 'sources' => ['floor']]);

        $part = $this->storePart();
        $this->assertTrue($this->check($part, 'levels')['done']);
        $this->assertTrue($this->check($part, 'route')['done']);
        $this->assertFalse($this->check($part, 'bin')['done'], 'a floor level is not a shelf bin');
    }

    // ---- adding up -------------------------------------------------------------------------------------------

    #[Test]
    public function the_overall_percentage_adds_the_item_and_every_store_it_is_in(): void
    {
        $this->deployed();
        $two = Store::factory()->create(['name' => 'Second Store', 'status' => 'active']);
        app(ItemDeployer::class)->deploy($this->item->fresh(), $two);

        $r = $this->readiness();
        $this->assertCount(2, $r['stores']);

        $all = array_merge($r['item']['checks'], ...array_map(fn (array $s) => $s['checks'], $r['stores']));
        $this->assertSame(app(ItemReadiness::class)->percent($all), $r['percent']);
        $this->assertNotSame($r['item']['percent'], $r['percent']);
    }

    #[Test]
    public function a_fully_set_up_item_is_one_hundred_percent(): void
    {
        $this->deployed(25);
        ShelfItemBand::query()->create(['stock_location_id' => $this->shelf()->id, 'item_id' => $this->item->id, 'max_units' => 12, 'refill_units' => 4, 'critical_units' => 1]);
        $this->stocktake(Stocktake::POSTED);

        $r = $this->readiness();

        $this->assertSame(100, $r['percent']);
        $this->assertSame(100, $r['item']['percent']);
        $this->assertSame(100, $r['stores'][$this->store->id]['percent']);
    }

    // ---- remembering it --------------------------------------------------------------------------------------------

    #[Test]
    public function refresh_remembers_the_percentage_without_touching_updated_at(): void
    {
        $this->item->forceFill(['readiness_percent' => null, 'updated_at' => '2020-01-01 00:00:00'])->saveQuietly();
        $item = $this->item->fresh();

        $result = app(ItemReadiness::class)->refresh($item);

        $fresh = $this->item->fresh();
        $this->assertSame($result['percent'], (int) $fresh->readiness_percent);
        $this->assertSame('2020-01-01 00:00:00', $fresh->updated_at->toDateTimeString());
        $this->assertSame($result['percent'], (int) $item->readiness_percent, 'the model in hand is updated too');
    }

    #[Test]
    public function refresh_follows_a_change_and_is_stable_when_nothing_changed(): void
    {
        $readiness = app(ItemReadiness::class);
        $before = $readiness->refresh($this->item->fresh())['percent'];
        $this->assertSame($before, $readiness->refresh($this->item->fresh())['percent']);

        $this->variant->forceFill(['barcode' => null])->save();
        $after = $readiness->refresh($this->item->fresh())['percent'];

        $this->assertLessThan($before, $after);
        $this->assertSame($after, (int) $this->item->fresh()->readiness_percent);
    }

    #[Test]
    public function an_item_with_nothing_set_up_still_gets_a_percentage_and_never_errors(): void
    {
        $bare = Item::factory()->create(['product_name' => 'Bare', 'item_category_id' => null, 'general_images' => null, 'description' => null]);

        $r = app(ItemReadiness::class)->refresh($bare);

        $this->assertIsInt($r['percent']);
        $this->assertGreaterThanOrEqual(0, $r['percent']);
        $this->assertLessThan(50, $r['percent']);
    }
}
