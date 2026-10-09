<?php

declare(strict_types=1);

namespace Tests\Feature\Fulfillment;

use App\Exceptions\CartCheckoutException;
use App\Exceptions\InsufficientStockException;
use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\Fulfillment\MovementDomainService;
use App\Services\Fulfillment\OrderSourcingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use RuntimeException;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Order sourcing, from the cart to the van.
 *
 * Two halves of the same question. Before payment the buyer is told where each
 * line comes from and must accept any wait that implies. After payment the order
 * sits in Pick & Pack until staff name the exact location every line was picked
 * from — and only then does it become a delivery, originating from that place.
 */
class OrderSourcingTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Store $hub;

    private ItemVariant $variant;

    private StoreVariant $storeVariant;

    private User $staff;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);

        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->storeVariant = StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_variant_id' => $this->variant->id,
            'pricing_matrix' => ['price' => 100.0],
        ]);

        $this->staff = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $this->staff->assignRole('seller');
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    private function sourcing(): OrderSourcingService
    {
        return app(OrderSourcingService::class);
    }

    private function stockAt(string $type, int $id, int $quantity): void
    {
        ItemStock::updateOrCreate(
            [
                'item_variant_id' => $this->variant->id,
                'location_type' => $type,
                'location_id' => $id,
            ],
            ['quantity' => $quantity, 'min_stock_level' => 0],
        );
    }

    private function shelfId(): int
    {
        return (int) $this->store->inventoryLocations()->shelves()->firstOrFail()->id;
    }

    private function cartWith(int $quantity = 2): Cart
    {
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'seller_id' => $this->staff->id,
            'status' => 'open',
        ]);

        $cart->variants()->attach($this->variant->id, [
            'quantity' => $quantity,
            'price' => 100.0,
            'store_id' => $this->store->id,
        ]);

        return $cart->refresh();
    }

    /**
     * Sellable only from the hub: the store holds none, the hub holds plenty.
     * Checkout may then hold the line at the hub, if the buyer agrees to wait.
     */
    private function sellableFromTheHubOnly(): void
    {
        $this->stockAt(Store::class, (int) $this->hub->id, 500);
    }

    /** A paid order sitting in Pick & Pack. */
    private function paidOrder(int $quantity = 2): Sale
    {
        $sale = Sale::create([
            'reference_number' => 'SALE-TEST-1',
            'store_id' => $this->store->id,
            'seller_id' => $this->staff->id,
            'subtotal' => 200.0,
            'total_amount' => 200.0,
            'status' => 'completed',
            'payment_status' => 'paid',
            'fulfillment_stage' => Sale::STAGE_PICK_PACK,
        ]);

        SaleItem::create([
            'sale_id' => $sale->id,
            'store_variant_id' => $this->storeVariant->id,
            'quantity' => $quantity,
            'unit_price' => 100.0,
            'subtotal' => 100.0 * $quantity,
            'total_price' => 100.0 * $quantity,
        ]);

        return $sale->refresh();
    }

    /* ---------------------------------------------------------------------
     | Grouping the cart
     |--------------------------------------------------------------------*/

    #[Test]
    public function a_cart_line_is_grouped_by_the_closest_location_that_can_serve_it(): void
    {
        $this->stockAt(ItemInventoryLocation::class, $this->shelfId(), 10);
        $this->stockAt(Store::class, (int) $this->store->id, 50);
        $this->stockAt(Store::class, (int) $this->hub->id, 500);

        $grouped = $this->sourcing()->groupCart($this->cartWith(2), $this->store);

        $this->assertCount(1, $grouped['groups']);
        $this->assertSame(MovementDomainService::NODE_SHELF, $grouped['groups'][0]['key']);
        $this->assertFalse($grouped['requires_agreement']);
        $this->assertSame(0, $grouped['delayed_line_count']);
    }

    #[Test]
    public function a_line_only_the_hub_can_serve_is_marked_as_arriving_later(): void
    {
        // Nothing locally; the hub is the only place holding it.
        $this->stockAt(Store::class, (int) $this->hub->id, 500);

        $grouped = $this->sourcing()->groupCart($this->cartWith(2), $this->store);

        $this->assertSame(MovementDomainService::NODE_MAIN_WAREHOUSE, $grouped['groups'][0]['key']);
        $this->assertTrue($grouped['groups'][0]['requires_agreement']);
        $this->assertSame('Available tomorrow', $grouped['groups'][0]['promise']);
        $this->assertTrue($grouped['requires_agreement']);
        $this->assertSame(1, $grouped['delayed_line_count']);
    }

    #[Test]
    public function checkout_is_refused_until_the_buyer_agrees_to_the_delay(): void
    {
        $this->sellableFromTheHubOnly();

        $cart = $this->cartWith(1);
        $checkout = app(CheckoutService::class);

        try {
            $checkout->checkout($cart, ['payment_method' => 'cash'], $this->staff->id);
            $this->fail('Checkout must refuse a delayed order the buyer has not agreed to.');
        } catch (CartCheckoutException $exception) {
            $this->assertStringContainsString('arrive later', $exception->getMessage());
        }

        $this->assertSame(0, Sale::query()->count());
    }

    #[Test]
    public function an_agreed_delay_is_recorded_on_the_sale(): void
    {
        $this->sellableFromTheHubOnly();

        $sale = app(CheckoutService::class)->checkout(
            cart: $this->cartWith(1),
            paymentData: ['payment_method' => 'cash'],
            userId: $this->staff->id,
            deliveryData: [],
            delayAgreed: true,
        );

        $this->assertNotNull($sale->delay_agreed_at);
        $this->assertTrue($sale->delayAgreed());

        // The promise is backed by a real hold on hub stock.
        $hold = \App\Models\Inventory\StockReservation::query()->open()->sole();
        $this->assertSame(
            \App\Models\Inventory\StockLocation::query()->legacy(Store::class, (int) $this->hub->id)->value('id'),
            $hold->stock_location_id,
        );
    }

    #[Test]
    public function a_paid_order_lands_in_pick_and_pack_rather_than_straight_in_delivery(): void
    {
        $this->stockAt(ItemInventoryLocation::class, $this->shelfId(), 10);
        $this->stockAt(Store::class, (int) $this->store->id, 10);

        $sale = app(CheckoutService::class)->checkout(
            cart: $this->cartWith(1),
            paymentData: ['payment_method' => 'cash'],
            userId: $this->staff->id,
        );

        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->fulfillment_stage);
        $this->assertNull($sale->sourcing_confirmed_at);
    }

    #[Test]
    public function an_unpaid_order_waits_for_payment(): void
    {
        $this->stockAt(Store::class, (int) $this->store->id, 10);

        $sale = app(CheckoutService::class)->checkout(cart: $this->cartWith(1), userId: $this->staff->id);

        $this->assertSame(Sale::STAGE_AWAITING_PAYMENT, $sale->fulfillment_stage);
    }

    /* ---------------------------------------------------------------------
     | Pick & Pack
     |--------------------------------------------------------------------*/

    #[Test]
    public function the_plan_offers_every_customer_source_and_suggests_the_nearest_that_can_cover_the_line(): void
    {
        $this->stockAt(ItemInventoryLocation::class, $this->shelfId(), 1);
        $this->stockAt(Store::class, (int) $this->store->id, 10);
        $this->stockAt(Store::class, (int) $this->hub->id, 500);

        $plan = $this->sourcing()->pickPackPlan($this->paidOrder(5));
        $line = $plan['lines'][0];

        $kinds = array_column($line['options'], 'kind');
        $this->assertContains(MovementDomainService::NODE_SHELF, $kinds);
        $this->assertContains(MovementDomainService::NODE_BACKROOM, $kinds);
        // Main Hubs ship to stores; they never serve a customer directly.
        $this->assertNotContains(MovementDomainService::NODE_MAIN_WAREHOUSE, $kinds);

        // The shelf holds 1 of the 5 needed, so it is offered but not suggested.
        $shelfOption = collect($line['options'])->firstWhere('kind', MovementDomainService::NODE_SHELF);
        $this->assertFalse($shelfOption['sufficient']);

        $this->assertNotNull($line['suggested_source']);
        $this->assertSame(
            MovementDomainService::NODE_BACKROOM,
            collect($line['options'])
                ->firstWhere(fn (array $option): bool => $option['location_type'] === $line['suggested_source']['location_type']
                    && $option['location_id'] === $line['suggested_source']['location_id'])['kind'],
        );
    }

    #[Test]
    public function confirming_sourcing_books_the_stock_out_of_the_chosen_place_and_moves_the_order_on(): void
    {
        $this->stockAt(ItemInventoryLocation::class, $this->shelfId(), 10);
        $this->stockAt(Store::class, (int) $this->store->id, 30);

        $sale = $this->paidOrder(4);
        $line = $sale->items->first();

        $this->sourcing()->confirmSourcing($sale, [[
            'sale_item_id' => (int) $line->id,
            'location_type' => ItemInventoryLocation::class,
            'location_id' => $this->shelfId(),
        ]], $this->staff);

        $sale->refresh();
        $line->refresh();

        $this->assertSame(Sale::STAGE_TO_DELIVER, $sale->fulfillment_stage);
        $this->assertNotNull($sale->sourcing_confirmed_at);
        $this->assertSame($this->staff->id, $sale->sourcing_confirmed_by);

        $this->assertSame(ItemInventoryLocation::class, $line->source_location_type);
        $this->assertSame($this->shelfId(), (int) $line->source_location_id);
        $this->assertSame(4, $line->picked_quantity);
        $this->assertTrue($line->isSourced());

        $this->assertSame(6, (int) ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('location_type', ItemInventoryLocation::class)
            ->where('location_id', $this->shelfId())
            ->value('quantity'), 'The units leave the place they were picked from.');

        // The delivery exists and knows where it came from.
        $delivery = $sale->delivery()->firstOrFail();
        $this->assertSame(ItemInventoryLocation::class, $delivery->source_location_type);
        $this->assertSame($this->shelfId(), (int) $delivery->source_location_id);
        $this->assertSame((int) $this->store->id, (int) $delivery->source_store_id);
    }

    #[Test]
    public function a_location_that_cannot_cover_the_line_is_refused_and_nothing_moves(): void
    {
        $this->stockAt(ItemInventoryLocation::class, $this->shelfId(), 1);
        $this->stockAt(Store::class, (int) $this->store->id, 30);

        $sale = $this->paidOrder(4);
        $line = $sale->items->first();

        try {
            $this->sourcing()->confirmSourcing($sale, [[
                'sale_item_id' => (int) $line->id,
                'location_type' => ItemInventoryLocation::class,
                'location_id' => $this->shelfId(),
            ]], $this->staff);

            $this->fail('A short location must not be accepted as a pick source.');
        } catch (InsufficientStockException $exception) {
            $this->assertStringContainsString('Store Shelf', $exception->getMessage());
        }

        $sale->refresh();

        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->fulfillment_stage);
        $this->assertSame(1, (int) ItemStock::query()
            ->where('item_variant_id', $this->variant->id)
            ->where('location_type', ItemInventoryLocation::class)
            ->value('quantity'), 'A refused confirmation must leave the ledger untouched.');
    }

    #[Test]
    public function every_line_must_be_sourced_before_the_order_can_move(): void
    {
        $this->stockAt(Store::class, (int) $this->store->id, 30);

        $sale = $this->paidOrder(2);

        $this->expectException(RuntimeException::class);

        $this->sourcing()->confirmSourcing($sale, [], $this->staff);
    }

    /* ---------------------------------------------------------------------
     | Through the seller's screens
     |--------------------------------------------------------------------*/

    #[Test]
    public function the_pick_and_pack_screen_serves_the_real_plan(): void
    {
        $this->stockAt(ItemInventoryLocation::class, $this->shelfId(), 10);
        $this->stockAt(Store::class, (int) $this->store->id, 30);

        $sale = $this->paidOrder(2);

        $response = $this->actingAs($this->staff, 'web')
            ->withServerVariables(['HTTP_HOST' => 'seller.' . config('app.system_domain')])
            ->get(route('seller.orders.pickpack', $sale->reference_number));

        $response->assertOk();

        $props = $response->viewData('page')['props'];

        $this->assertSame('Seller/Orders/PickPack', $response->viewData('page')['component']);
        $this->assertSame($sale->reference_number, $props['plan']['sale']['reference']);
        $this->assertCount(1, $props['plan']['lines']);
    }

    #[Test]
    public function the_board_lists_only_the_sellers_own_orders_to_pick_and_the_old_queue_link_lands_there(): void
    {
        $this->paidOrder(2);

        $otherStore = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        Sale::create([
            'reference_number' => 'SALE-OTHER-1',
            'store_id' => $otherStore->id,
            'total_amount' => 10,
            'status' => 'completed',
            'payment_status' => 'paid',
            'fulfillment_stage' => Sale::STAGE_PICK_PACK,
        ]);

        $seller = $this->actingAs($this->staff, 'web')
            ->withServerVariables(['HTTP_HOST' => 'seller.' . config('app.system_domain')]);

        $seller->get(route('seller.orders.queue'))
            ->assertRedirect(route('seller.orders.index').'?tab=paid');

        $orders = $seller->get(route('seller.orders.index'))->viewData('page')['props']['orders'];

        $this->assertSame(['SALE-TEST-1'], array_column($orders, 'reference'));
        $this->assertSame('paid', $orders[0]['stage']);
        $this->assertSame(['done' => 0, 'total' => 1], $orders[0]['sourced']);
    }

    #[Test]
    public function the_confirm_endpoint_moves_the_order_to_delivery(): void
    {
        $this->stockAt(ItemInventoryLocation::class, $this->shelfId(), 10);
        $this->stockAt(Store::class, (int) $this->store->id, 30);

        $sale = $this->paidOrder(2);

        $this->actingAs($this->staff, 'web')
            ->withServerVariables(['HTTP_HOST' => 'seller.' . config('app.system_domain')])
            ->post(route('seller.orders.sourcing.confirm', $sale), [
                'lines' => [[
                    'sale_item_id' => (int) $sale->items->first()->id,
                    'location_type' => ItemInventoryLocation::class,
                    'location_id' => $this->shelfId(),
                ]],
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('seller.orders.index').'?tab=paid');

        $this->assertSame(Sale::STAGE_TO_DELIVER, $sale->fresh()->fulfillment_stage);
    }
}
