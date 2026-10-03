<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Inventory\ItemStock;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Models\Store\StoreVariantCapacity;
use App\Services\Fulfillment\SellerOrderBoard;
use App\Services\Inventory\SellerLocationBoard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The More hub's "My Orders" card, the order list it opens, and the location
 * strip under it, all read from the database.
 */
class SellerOrderBoardTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StoreVariant $storeVariant;

    private User $seller;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'seller']);

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);

        $item = Item::factory()->create(['status' => 'active', 'product_name' => 'Blue Pen']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => 100.0],
        ]);

        $this->seller = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $this->seller->assignRole('seller');
    }

    private function sale(string $reference, string $stage, string $payment = 'paid', int $picked = 0, ?Store $store = null): Sale
    {
        $sale = Sale::create([
            'reference_number' => $reference,
            'store_id' => ($store ?? $this->store)->id,
            'seller_id' => $this->seller->id,
            'subtotal' => 200.0,
            'total_amount' => 230.0,
            'status' => 'completed',
            'payment_status' => $payment,
            'fulfillment_stage' => $stage,
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'store_variant_id' => $this->storeVariant->id,
            'quantity' => 2,
            'picked_quantity' => $picked,
            'unit_price' => 100.0,
            'subtotal' => 200.0,
            'total_price' => 200.0,
        ]);

        return $sale;
    }

    private function onSellerHost(): static
    {
        return $this->actingAs($this->seller, 'web')
            ->withServerVariables(['HTTP_HOST' => 'seller.' . config('app.system_domain')]);
    }

    #[Test]
    public function it_maps_every_sale_stage_onto_the_six_seller_tabs(): void
    {
        $this->sale('S-PAY', Sale::STAGE_AWAITING_PAYMENT, 'pending');
        $this->sale('S-PAID', Sale::STAGE_PICK_PACK);
        $this->sale('S-PACK', Sale::STAGE_PICK_PACK, 'paid', 1);
        $this->sale('S-SHIP', Sale::STAGE_TO_DELIVER);
        $this->sale('S-DONE', Sale::STAGE_DELIVERED);
        $this->sale('S-VOID', Sale::STAGE_CANCELLED);

        $counts = app(SellerOrderBoard::class)->counts($this->store->id);

        $this->assertSame([
            'to_pay' => 1,
            'paid' => 1,
            'packing' => 1,
            'to_deliver' => 1,
            'delivered' => 1,
            'canceled' => 1,
        ], $counts);
    }

    #[Test]
    public function the_hub_tiles_and_the_order_list_agree_and_stay_in_the_sellers_store(): void
    {
        $this->sale('S-MINE', Sale::STAGE_TO_DELIVER);
        $this->sale('S-THEIRS', Sale::STAGE_TO_DELIVER, 'paid', 0, Store::factory()->create(['type' => Store::TYPE_RETAIL]));

        $this->onSellerHost()->get(route('seller.menu.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Menu/Index')
                ->where('stats.order_stages.to_deliver', 1)
                ->has('locations', 5));

        $this->onSellerHost()->get(route('seller.orders.index'))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Orders/index')
                ->has('orders', 1)
                ->where('orders.0.reference', 'S-MINE')
                ->where('orders.0.stage', 'to_deliver')
                ->where('orders.0.lines.0.name', 'Blue Pen')
                // Tax and discount travel as additional charges, so the card
                // total (2 × 100 + 30) equals the sale total.
                ->where('orders.0.additionalCharges', 30));
    }

    #[Test]
    public function the_pay_screen_gets_the_real_order(): void
    {
        $this->sale('S-PAY', Sale::STAGE_AWAITING_PAYMENT, 'pending');

        $this->onSellerHost()->get(route('seller.orders.pay', ['reference' => 'S-PAY']))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Orders/ToPay')
                ->where('order.reference', 'S-PAY')
                ->where('order.stage', 'to_pay'));
    }

    #[Test]
    public function the_shelf_opens_with_its_replenishment_row_and_other_stores_are_hidden(): void
    {
        $shelf = StockLocation::query()
            ->where('store_id', $this->store->id)
            ->where('kind', StockLocation::KIND_SHELF)
            ->firstOrFail();

        $this->onSellerHost()->get(route('seller.locations.show', $shelf))
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Seller/Locations/Show')
                ->where('location.kind', 'shelf')
                ->where('rowSize', 10)
                ->has('shelfLines')
                ->has('strip', 5));

        $otherShelf = StockLocation::query()
            ->where('store_id', Store::factory()->create(['type' => Store::TYPE_RETAIL])->id)
            ->where('kind', StockLocation::KIND_SHELF)
            ->firstOrFail();

        $this->onSellerHost()->get(route('seller.locations.show', $otherShelf))->assertNotFound();
    }

    #[Test]
    public function a_shelf_box_fills_to_on_hand_over_max_with_its_refill_line_at_min(): void
    {
        $shelf = StockLocation::query()
            ->where('store_id', $this->store->id)
            ->where('kind', StockLocation::KIND_SHELF)
            ->firstOrFail();

        StoreVariantCapacity::create([
            'store_variant_id' => $this->storeVariant->id,
            'item_variant_id' => $this->storeVariant->item_variant_id,
            'location_type' => $shelf->legacy_type,
            'location_id' => $shelf->legacy_id,
            'min_capacity' => 4,
            'max_capacity' => 20,
        ]);

        ItemStock::create([
            'item_variant_id' => $this->storeVariant->item_variant_id,
            'location_type' => $shelf->legacy_type,
            'location_id' => $shelf->legacy_id,
            'quantity' => 3,
        ]);

        $line = app(SellerLocationBoard::class)->shelfLines($shelf)[0];

        $this->assertSame('Blue Pen', $line['name']);
        $this->assertSame(3, $line['on_hand']);
        $this->assertSame(0.15, $line['fill']);
        $this->assertSame(17, $line['refill']);
        $this->assertSame('refill', $line['status']);

        // The same line raises the shelf tile's badge on the More hub.
        $shelfTile = collect(app(SellerLocationBoard::class)->strip($this->store->id))->firstWhere('key', 'shelf');
        $this->assertSame(1, $shelfTile['alert']);
    }
}
