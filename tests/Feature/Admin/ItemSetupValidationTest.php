<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Inventory\Stocktake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/**
 * What every endpoint of the item setup page does with bad input: it answers with an error beside the right field,
 * and changes nothing.
 */
class ItemSetupValidationTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private int $rowId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpSetupItem();
        Storage::fake('r2');
        $this->rowId = $this->deployed(10)->id;
        $this->actingAs($this->admin);
    }

    /** The routes the cases below call, with the models each needs. @param list<string> $names @return array<string, mixed> */
    private function params(array $names): array
    {
        $all = ['item' => $this->item, 'store' => $this->store, 'shelf' => $this->shelf(), 'variant' => $this->variant, 'slot' => 0];

        return array_map(fn (string $n) => $all[$n], $names);
    }

    /** @param array<string, mixed> $payload @param list<string> $names */
    private function call2(string $method, string $route, array $names, array $payload)
    {
        return $this->{strtolower($method).'Json'}(route($route, $this->params($names)), $payload);
    }

    private function snapshot(): array
    {
        return [
            $this->item->fresh()->only(['product_name', 'status', 'item_category_id', 'general_images']),
            $this->variant->fresh()->barcode,
            \App\Models\Store\StoreVariant::query()->orderBy('id')->get()->map->only(['pricing_matrix', 'active', 'business_pool'])->all(),
            \App\Models\Inventory\ShelfItemBand::query()->count(),
            \App\Models\Inventory\ItemRefillRoute::query()->count(),
            \App\Models\Item\Item::query()->count(),
        ];
    }

    // ---- 422 cases: [method, route, params, payload (given $this), the error keys] ----------------

    /** @return array<string, array{0: string, 1: string, 2: list<string>, 3: \Closure, 4: list<string>}> */
    public static function rejected(): array
    {
        $line = static fn (self $t, array $extra = []) => ['variants' => [array_merge(['store_variant_id' => $t->rowId, 'price' => 10], $extra)]];
        $basics = ['product_name' => 'Pencil', 'item_category_id' => 1, 'status' => 'draft'];

        return [
            // basics and creating
            'basics: no name' => ['PUT', 'admin.items.setup.basics', ['item'], static fn () => array_merge($basics, ['product_name' => '']), ['product_name']],
            'basics: a 256-letter name' => ['PUT', 'admin.items.setup.basics', ['item'], static fn () => array_merge($basics, ['product_name' => str_repeat('a', 256)]), ['product_name']],
            'basics: an unknown status' => ['PUT', 'admin.items.setup.basics', ['item'], static fn () => array_merge($basics, ['status' => 'live']), ['status']],
            'basics: no status' => ['PUT', 'admin.items.setup.basics', ['item'], static fn () => array_diff_key($basics, ['status' => 1]), ['status']],
            'basics: no category' => ['PUT', 'admin.items.setup.basics', ['item'], static fn () => array_diff_key($basics, ['item_category_id' => 1]), ['item_category_id']],
            'create: nothing' => ['POST', 'admin.items.setup.store', [], static fn () => [], ['product_name', 'item_category_id', 'status']],
            'create: an unknown status' => ['POST', 'admin.items.setup.store', [], static fn () => array_merge($basics, ['status' => 'x']), ['status']],

            // prices
            'prices: no lines' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn () => ['variants' => []], ['variants']],
            'prices: the key missing' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn () => [], ['variants']],
            'prices: a line without its variant' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn () => ['variants' => [['price' => 5]]], ['variants.0.store_variant_id']],
            'prices: no price' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn () => ['variants' => [['store_variant_id' => 1]]], ['variants.0.price']],
            'prices: a negative price' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['price' => -1]), ['variants.0.price']],
            'prices: a price in words' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['price' => 'ten']), ['variants.0.price']],
            'prices: a discount above the price' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['discount_price' => 11, 'discount_ends_at' => '2030-01-01']), ['variants.0.discount_price']],
            'prices: a discount with no end' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['discount_price' => 5]), ['variants.0.discount_ends_at']],
            'prices: a discount end that is not a date' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['discount_price' => 5, 'discount_ends_at' => 'soon']), ['variants.0.discount_ends_at']],
            'prices: a negative individual price' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['individual_price' => -3]), ['variants.0.individual_price']],
            'prices: on sale as a word' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['on_sale' => 'maybe']), ['variants.0.on_sale']],
            'prices: a negative pool' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['business_pool' => -1]), ['variants.0.business_pool']],
            'prices: a fractional pool' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['business_pool' => 1.5]), ['variants.0.business_pool']],
            'prices: a pool of ten million and one' => ['PUT', 'admin.items.setup.prices', ['item', 'store'], static fn (self $t) => $line($t, ['business_pool' => 10000001]), ['variants.0.business_pool']],

            // shelf bin
            'bin: no figures' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => [], ['max', 'refill', 'critical']],
            'bin: a maximum of zero' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => ['max' => 0, 'refill' => 0, 'critical' => 0], ['max']],
            'bin: a negative refill' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => ['max' => 5, 'refill' => -1, 'critical' => 0], ['refill']],
            'bin: figures in words' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => ['max' => 'lots', 'refill' => 'some', 'critical' => 'few'], ['max', 'refill', 'critical']],
            'bin: a fractional maximum' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => ['max' => 5.5, 'refill' => 2, 'critical' => 1], ['max']],
            'bin: an unknown packaging type' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => ['max' => 5, 'refill' => 2, 'critical' => 1, 'item_packaging_type_id' => 987654], ['item_packaging_type_id']],
            'bin: refill above the maximum' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => ['max' => 5, 'refill' => 9, 'critical' => 1], ['bin']],
            'bin: critical above refill' => ['PUT', 'admin.items.setup.bin', ['item', 'shelf'], static fn () => ['max' => 9, 'refill' => 3, 'critical' => 4], ['bin']],

            // options
            'options: a packaging row with no quantity' => ['PUT', 'admin.items.setup.options', ['item'], static fn () => ['packaging' => [['item_packaging_type_id' => 'new:Box']]], ['packaging.0.quantity']],
            'options: a quantity of zero' => ['PUT', 'admin.items.setup.options', ['item'], static fn () => ['packaging' => [['item_packaging_type_id' => 'new:Box', 'quantity' => 0]]], ['packaging.0.quantity']],
            'options: a fractional quantity' => ['PUT', 'admin.items.setup.options', ['item'], static fn () => ['packaging' => [['item_packaging_type_id' => 'new:Box', 'quantity' => 1.5]]], ['packaging.0.quantity']],
            'options: a quantity in words' => ['PUT', 'admin.items.setup.options', ['item'], static fn () => ['packaging' => [['item_packaging_type_id' => 'new:Box', 'quantity' => 'many']]], ['packaging.0.quantity']],
            'options: a row with no packaging type' => ['PUT', 'admin.items.setup.options', ['item'], static fn () => ['packaging' => [['quantity' => 1]]], ['packaging.0.item_packaging_type_id']],
            'options: colours that are not a list' => ['PUT', 'admin.items.setup.options', ['item'], static fn () => ['color_ids' => 'red'], ['color_ids']],
            'preview: the same rules' => ['POST', 'admin.items.setup.options.preview', ['item'], static fn () => ['packaging' => [['quantity' => 0]]], ['packaging.0.quantity', 'packaging.0.item_packaging_type_id']],

            // barcodes
            'barcodes: none given' => ['PUT', 'admin.items.setup.barcodes', ['item'], static fn () => [], ['barcodes']],
            'barcodes: not a list' => ['PUT', 'admin.items.setup.barcodes', ['item'], static fn () => ['barcodes' => 'abc'], ['barcodes']],
            'barcodes: a code of 65 letters' => ['PUT', 'admin.items.setup.barcodes', ['item'], static fn (self $t) => ['barcodes' => [$t->variant->id => str_repeat('A', 65)]], ['barcodes.*']],
            'barcodes: three characters' => ['PUT', 'admin.items.setup.barcodes', ['item'], static fn (self $t) => ['barcodes' => [$t->variant->id => 'abc']], ['barcodes.*']],
            'barcodes: thirty-three characters' => ['PUT', 'admin.items.setup.barcodes', ['item'], static fn (self $t) => ['barcodes' => [$t->variant->id => str_repeat('1', 33)]], ['barcodes.*']],
            'barcodes: a space inside' => ['PUT', 'admin.items.setup.barcodes', ['item'], static fn (self $t) => ['barcodes' => [$t->variant->id => '1234 5678']], ['barcodes.*']],
            'barcodes: symbols' => ['PUT', 'admin.items.setup.barcodes', ['item'], static fn (self $t) => ['barcodes' => [$t->variant->id => '12345€#!']], ['barcodes.*']],

            // variant pictures
            'variant picture: none sent' => ['POST', 'admin.items.setup.image', ['item', 'variant', 'slot'], static fn () => [], ['image']],
            'variant picture: not a picture' => ['POST', 'admin.items.setup.image', ['item', 'variant', 'slot'], static fn () => ['image' => UploadedFile::fake()->create('notes.txt', 10, 'text/plain')], ['image']],
            'variant picture: a pdf' => ['POST', 'admin.items.setup.image', ['item', 'variant', 'slot'], static fn () => ['image' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf')], ['image']],
            'variant picture: six megabytes' => ['POST', 'admin.items.setup.image', ['item', 'variant', 'slot'], static fn () => ['image' => UploadedFile::fake()->image('big.jpg')->size(6000)], ['image']],

            // item pictures
            'picture: none sent' => ['POST', 'admin.items.setup.pictures.store', ['item'], static fn () => [], ['image']],
            'picture: not a picture' => ['POST', 'admin.items.setup.pictures.store', ['item'], static fn () => ['image' => UploadedFile::fake()->create('notes.txt', 10, 'text/plain')], ['image']],
            'picture: six megabytes' => ['POST', 'admin.items.setup.pictures.store', ['item'], static fn () => ['image' => UploadedFile::fake()->image('big.jpg')->size(6000)], ['image']],
            'picture: no path to remove' => ['DELETE', 'admin.items.setup.pictures.destroy', ['item'], static fn () => [], ['path']],

            // refill route
            'route: no sources' => ['PUT', 'admin.items.setup.route', ['item', 'store'], static fn () => ['sources' => []], ['sources']],
            'route: an unknown source' => ['PUT', 'admin.items.setup.route', ['item', 'store'], static fn () => ['sources' => ['teleport']], ['sources.0']],
            'route: a source twice' => ['PUT', 'admin.items.setup.route', ['item', 'store'], static fn () => ['sources' => ['floor', 'floor']], ['sources.0', 'sources.1']],
            'route: more than there are' => ['PUT', 'admin.items.setup.route', ['item', 'store'], static fn () => ['sources' => ['floor', 'remote_hub', 'shipment', 'floor']], ['sources']],

            // counts
            'count: nothing counted' => ['POST', 'admin.items.setup.count', ['item', 'shelf'], static fn () => [], ['counts']],
            'count: an empty list' => ['POST', 'admin.items.setup.count', ['item', 'shelf'], static fn () => ['counts' => []], ['counts']],
            'count: a negative figure' => ['POST', 'admin.items.setup.count', ['item', 'shelf'], static fn (self $t) => ['counts' => [$t->variant->id => -1]], ['counts.*']],
            'count: a figure in words' => ['POST', 'admin.items.setup.count', ['item', 'shelf'], static fn (self $t) => ['counts' => [$t->variant->id => 'ten']], ['counts.*']],
            'count: a fraction' => ['POST', 'admin.items.setup.count', ['item', 'shelf'], static fn (self $t) => ['counts' => [$t->variant->id => 2.5]], ['counts.*']],
            'count: a hundred million and one' => ['POST', 'admin.items.setup.count', ['item', 'shelf'], static fn (self $t) => ['counts' => [$t->variant->id => 100000001]], ['counts.*']],
            'count: every figure blank' => ['POST', 'admin.items.setup.count', ['item', 'shelf'], static fn (self $t) => ['counts' => [$t->variant->id => '']], ['count']],

            // seller and customer prices
            'seller price: no seller' => ['PUT', 'admin.items.setup.seller-prices', ['item', 'store'], static fn (self $t) => ['customer_type' => 'business'] + $line($t), ['seller_id']],
            'seller price: an unknown seller' => ['PUT', 'admin.items.setup.seller-prices', ['item', 'store'], static fn (self $t) => ['seller_id' => 987654, 'customer_type' => 'business'] + $line($t), ['seller_id']],
            'seller price: no tier' => ['PUT', 'admin.items.setup.seller-prices', ['item', 'store'], static fn (self $t) => ['seller_id' => $t->admin->id] + $line($t), ['customer_type']],
            'seller price: a tier that does not exist' => ['PUT', 'admin.items.setup.seller-prices', ['item', 'store'], static fn (self $t) => ['seller_id' => $t->admin->id, 'customer_type' => 'vip'] + $line($t), ['customer_type']],
            'seller price: a discount above the price' => ['PUT', 'admin.items.setup.seller-prices', ['item', 'store'], static fn (self $t) => ['seller_id' => $t->admin->id, 'customer_type' => 'business'] + $line($t, ['discount_price' => 20, 'discount_ends_at' => '2030-01-01']), ['variants.0.discount_price']],
            'customer price: no customer' => ['PUT', 'admin.items.setup.customer-prices', ['item', 'store'], static fn (self $t) => $line($t), ['customer_id']],
            'customer price: an unknown customer' => ['PUT', 'admin.items.setup.customer-prices', ['item', 'store'], static fn (self $t) => ['customer_id' => 987654] + $line($t), ['customer_id']],
            'customer price: a negative price' => ['PUT', 'admin.items.setup.customer-prices', ['item', 'store'], static fn (self $t) => ['customer_id' => Customer::factory()->create()->id] + $line($t, ['price' => -2]), ['variants.0.price']],
            'customer price: no lines' => ['PUT', 'admin.items.setup.customer-prices', ['item', 'store'], static fn () => ['customer_id' => Customer::factory()->create()->id, 'variants' => []], ['variants']],
        ];
    }

    #[Test]
    #[DataProvider('rejected')]
    public function bad_input_is_refused_beside_the_right_field_and_changes_nothing(string $method, string $route, array $names, \Closure $payload, array $keys): void
    {
        $before = $this->snapshot();

        $response = $this->call2($method, $route, $names, $payload($this));

        // A rule of the form itself answers 422 with the errors; a rule of the app (limits out of order, nothing
        // counted) comes back as a redirect carrying the error, which is how the Inertia page receives it.
        if ($response->getStatusCode() === 302) {
            $response->assertSessionHasErrors($keys);
        } else {
            $response->assertStatus(422);
            foreach ($keys as $key) {
                $this->assertTrue(
                    collect(array_keys($response->json('errors') ?? []))->contains(fn ($got) => $key === $got || (str_ends_with($key, '.*') && str_starts_with($got, substr($key, 0, -1)))),
                    "expected an error for {$key}; got ".json_encode(array_keys($response->json('errors') ?? [])),
                );
            }
        }
        $this->assertSame($before, $this->snapshot());
    }

    // ---- not found: the thing named in the address is not there ------------------------------------------

    #[Test]
    public function a_slot_beyond_the_fifth_is_not_found(): void
    {
        $this->post(route('admin.items.setup.image', [$this->item, $this->variant, 5]), ['image' => UploadedFile::fake()->image('a.jpg')])->assertNotFound();
        $this->delete(route('admin.items.setup.image.destroy', [$this->item, $this->variant, 9]))->assertNotFound();
        $this->assertNull($this->variant->fresh()->images[5] ?? null);
    }

    #[Test]
    public function an_address_with_a_negative_or_wordy_slot_does_not_exist(): void
    {
        $url = route('admin.items.setup.image', [$this->item, $this->variant, 5]);

        // No route matches (the admin site's catch-all only answers GET, so a POST is a 405): either way nothing runs.
        foreach (['-1', 'first', '1.5', ''] as $slot) {
            $status = $this->post(preg_replace('#/5$#', '/'.$slot, $url), ['image' => UploadedFile::fake()->image('a.jpg')])->getStatusCode();
            $this->assertContains($status, [404, 405], "slot '{$slot}' answered {$status}");
        }
        $this->assertEmpty(array_filter($this->variant->fresh()->images ?? []), 'no picture was stored');
    }

    #[Test]
    public function an_item_that_does_not_exist_is_not_found_everywhere(): void
    {
        $this->get(route('admin.items.setup', 999999))->assertNotFound();
        $this->putJson(route('admin.items.setup.basics', 999999), ['product_name' => 'x', 'item_category_id' => 1, 'status' => 'draft'])->assertNotFound();
        $this->putJson(route('admin.items.setup.barcodes', 999999), ['barcodes' => [1 => 'abcdef']])->assertNotFound();
        $this->postJson(route('admin.items.setup.options.preview', 999999), [])->assertNotFound();
        $this->putJson(route('admin.items.setup.prices', [999999, $this->store]), ['variants' => [['store_variant_id' => 1, 'price' => 1]]])->assertNotFound();
    }

    #[Test]
    public function a_store_or_place_or_count_that_does_not_exist_is_not_found(): void
    {
        $this->putJson(route('admin.items.setup.prices', [$this->item, 999999]), ['variants' => [['store_variant_id' => 1, 'price' => 1]]])->assertNotFound();
        $this->putJson(route('admin.items.setup.bin', [$this->item, 999999]), ['max' => 5, 'refill' => 2, 'critical' => 1])->assertNotFound();
        $this->postJson(route('admin.items.setup.count', [$this->item, 999999]), ['counts' => [1 => 1]])->assertNotFound();
        $this->postJson(route('admin.items.setup.count.approve', [$this->item, 999999]))->assertNotFound();
        $this->getJson(route('admin.items.setup.customers', 999999))->assertNotFound();
    }
}
