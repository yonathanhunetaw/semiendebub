<?php

declare(strict_types=1);

namespace Tests\Feature\Seller;

use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The seller's whole order, driven through the real routes as the real roles:
 *
 *   cart → confirmation → place (To pay) → split into a payment part →
 *   "customer says paid" → the account owner confirms (Paid) → Pick & Pack
 *   (To deliver) → courier claims, collects, delivers (Delivered)
 *
 * with the stock following it: held at checkout, into Delivery's custody at
 * Pick & Pack, out of the network on delivery.
 */
class SellerOrderJourneyTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private User $seller;

    private User $courier;

    private ItemVariant $variant;

    private StockLocation $shelf;

    /** The seller who owns the store's Telebirr account and confirms what lands in it. */
    private User $owner;

    private PaymentAccount $account;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['seller', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active']);
        $this->seller = $this->user('seller', $this->store->id);
        $this->courier = $this->user('delivery');

        $item = Item::factory()->create(['status' => 'active', 'product_name' => 'Gel Pen 0.7']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $item->id,
            'item_variant_id' => $this->variant->id,
            'pricing_matrix' => ['price' => 200.00],
            'active' => true,
        ]);

        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        app(StockService::class)->receive($this->variant->id, $this->shelf, 10);

        $this->owner = $this->user('seller', $this->store->id);
        $this->account = PaymentAccount::create([
            'store_id' => $this->store->id,
            'type' => PaymentAccount::TYPE_WALLET,
            'provider' => 'telebirr',
            'account_number' => '0912445780',
            'account_name' => 'Semien Debub Trading',
            'owner_user_id' => $this->owner->id,
            'purpose' => PaymentAccount::PURPOSE_COLLECTION,
            'is_active' => true,
        ]);
    }

    #[Test]
    public function a_seller_order_goes_from_cart_to_delivered(): void
    {
        // ── Cart ──
        $this->asSeller()->post(route('seller.carts.store'), [])->assertSessionHasNoErrors();
        $cart = Cart::query()->sole();

        $this->asSeller()
            ->post(route('seller.carts.items.store', $cart), ['variant_id' => $this->variant->id, 'quantity' => 3])
            ->assertSessionHasNoErrors();

        // ── Confirmation shows the real cart ──
        $this->asSeller()
            ->get(route('seller.orders.confirmation', ['cart' => $cart->id]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Seller/Orders/Confirmation')
                ->where('cart_id', $cart->id)
                ->where('order.lines.0.name', 'Gel Pen 0.7')
                ->where('order.lines.0.quantity', 3)
                ->where('order.lines.0.inStore', true));

        // ── Place, pay later → To pay, stock held ──
        $this->asSeller()
            ->post(route('seller.orders.store'), [
                'cart_id' => $cart->id,
                'delivery_address' => 'Bole, Woreda 03, House 412',
                'recipient_name' => 'Abebe Tadesse',
                'recipient_phone' => '0911223344',
            ])
            ->assertSessionHasNoErrors()
            ->assertRedirectContains('/pay');

        $sale = Sale::query()->sole();
        $this->assertSame(Sale::STAGE_AWAITING_PAYMENT, $sale->fulfillment_stage);
        $this->assertSame(7, app(StockService::class)->availableAtStore($this->variant->id, $this->store->id));
        $this->assertNotNull(StockReservation::query()->open()->sole()->expires_at, 'An unpaid hold lapses.');

        $this->asSeller()
            ->get(route('seller.orders.pay', ['reference' => $sale->reference_number]))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('order.stage', 'to_pay')
                ->where('order.expiresInMinutes', fn ($minutes) => $minutes > 47 * 60)
                ->where('accounts.0.id', $this->account->id));

        // ── The customer will pay by Telebirr ──
        $this->asSeller()
            ->put(route('seller.orders.payments.update', ['reference' => $sale->reference_number]), [
                'parts' => [['payment_account_id' => $this->account->id, 'amount' => 600, 'transaction_reference' => 'TB-998877']],
            ])
            ->assertSessionHas('success');

        $part = $sale->payments()->sole();
        $this->assertSame([Payment::STATUS_PENDING, Sale::STAGE_AWAITING_PAYMENT], [$part->status, $sale->fresh()->fulfillment_stage]);

        // ── "Customer says paid" → the owner's inbox ──
        $this->asSeller()
            ->post(route('seller.orders.payments.claim', ['reference' => $sale->reference_number, 'payment' => $part->id]))
            ->assertSessionHas('success');
        $this->assertNull(StockReservation::query()->open()->sole()->expires_at, 'A claimed payment stops the hold lapsing.');

        $this->as($this->owner, 'seller')
            ->get(route('seller.payments.inbox'))
            ->assertInertia(fn ($page) => $page->component('Seller/Payments/Inbox')->where('payments.0.order', $sale->reference_number));

        // ── The owner sees the deposit → Paid (Pick & Pack) ──
        $this->as($this->owner, 'seller')
            ->post(route('seller.payments.confirm', $part))
            ->assertSessionHas('success');

        $sale->refresh();
        $this->assertSame([Sale::STAGE_PICK_PACK, 'paid'], [$sale->fulfillment_stage, $sale->payment_status]);

        // Paying again is refused.
        $this->asSeller()
            ->put(route('seller.orders.payments.update', ['reference' => $sale->reference_number]), ['parts' => [['amount' => 600]]])
            ->assertSessionHas('error');

        // ── Pick & Pack → To deliver ──
        $this->asSeller()
            ->get(route('seller.orders.pickpack', ['reference' => $sale->reference_number]))
            ->assertOk();

        $this->asSeller()
            ->post(route('seller.orders.sourcing.confirm', $sale), [
                'lines' => $sale->items->map(fn ($item) => [
                    'sale_item_id' => $item->id,
                    'location_type' => StockLocation::class,
                    'location_id' => $this->shelf->id,
                ])->all(),
            ])
            ->assertSessionHasNoErrors();

        $sale->refresh();
        $this->assertSame(Sale::STAGE_TO_DELIVER, $sale->fulfillment_stage);
        $this->assertSame(7, $this->at($this->shelf));
        $this->assertSame(3, app(StockService::class)->inCustody($this->variant->id));

        // ── Delivery: the courier claims, collects, delivers ──
        $delivery = Delivery::query()->where('sale_id', $sale->id)->sole();
        $this->assertSame('Bole, Woreda 03, House 412', $delivery->delivery_address);

        $this->asCourier()->post(route('delivery.delivery.claim', $delivery))->assertSessionHas('success');

        foreach (['dispatched', 'in_transit', 'delivered'] as $status) {
            $this->asCourier()
                ->patch(route('delivery.delivery.transition', $delivery), ['status' => $status])
                ->assertSessionHas('success');
        }

        $sale->refresh();
        $this->assertSame(Sale::STAGE_DELIVERED, $sale->fulfillment_stage);
        $this->assertSame(0, app(StockService::class)->inCustody($this->variant->id));
        $this->assertSame(7, (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->sum('quantity'));

        // The seller's board reads it as delivered.
        $this->asSeller()
            ->get(route('seller.orders.index'))
            ->assertInertia(fn ($page) => $page->where('orders.0.stage', 'delivered'));
    }

    #[Test]
    public function paying_cash_on_the_spot_goes_straight_to_pick_and_pack(): void
    {
        $cart = $this->cart(2);

        $this->asSeller()
            ->post(route('seller.orders.store'), ['cart_id' => $cart->id, ...$this->cash(400)])
            ->assertSessionHasNoErrors()
            ->assertRedirectContains('/pick-pack');

        $sale = Sale::query()->sole();
        $this->assertSame([Sale::STAGE_PICK_PACK, 'paid'], [$sale->fulfillment_stage, $sale->payment_status]);
        $this->assertSame(Payment::STATUS_CONFIRMED, $sale->payments()->sole()->status, 'Cash in hand is confirmed by the seller taking it.');
    }

    #[Test]
    public function cancelling_an_unpaid_order_gives_its_stock_back(): void
    {
        $this->asSeller()->post(route('seller.orders.store'), ['cart_id' => $this->cart(4)->id]);
        $sale = Sale::query()->sole();
        $this->assertSame(6, app(StockService::class)->availableAtStore($this->variant->id, $this->store->id));

        $this->asSeller()
            ->post(route('seller.orders.cancel', ['reference' => $sale->reference_number]))
            ->assertSessionHasNoErrors();

        $this->assertSame(Sale::STAGE_CANCELLED, $sale->fresh()->fulfillment_stage);
        $this->assertSame(10, app(StockService::class)->availableAtStore($this->variant->id, $this->store->id));
    }

    #[Test]
    public function claiming_after_the_hold_lapsed_reserves_again_or_refuses_if_the_stock_is_gone(): void
    {
        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $this->cart(4)->id,
            'parts' => [['payment_account_id' => $this->account->id, 'amount' => 800]],
        ]);
        $sale = Sale::query()->sole();
        $part = $sale->payments()->sole();

        StockReservation::query()->update(['expires_at' => now()->subMinute()]);
        $this->artisan('stock:release-stale-reservations');

        // Someone else buys 8 of the 10 meanwhile.
        $this->asSeller()->post(route('seller.orders.store'), ['cart_id' => $this->cart(8)->id, ...$this->cash(1600)]);

        $this->asSeller()
            ->post(route('seller.orders.payments.claim', ['reference' => $sale->reference_number, 'payment' => $part->id]))
            ->assertSessionHas('error');

        $this->assertSame(Sale::STAGE_AWAITING_PAYMENT, $sale->fresh()->fulfillment_stage);
        $this->assertSame(Payment::STATUS_PENDING, $part->fresh()->status, 'A refused claim changes nothing.');
    }

    #[Test]
    public function extra_loose_pieces_are_charged_and_held_as_their_own_line(): void
    {
        $carton = \App\Models\Item\ItemPackagingType::factory()->create(['name' => 'Carton']);
        $piece = \App\Models\Item\ItemPackagingType::factory()->create(['name' => 'Piece']);
        $this->variant->update(['item_packaging_type_id' => $carton->id]);
        $pieceVariant = ItemVariant::factory()->create([
            'item_id' => $this->variant->item_id,
            'item_color_id' => $this->variant->item_color_id,
            'item_size_id' => $this->variant->item_size_id,
            'item_packaging_type_id' => $piece->id,
        ]);
        StoreVariant::factory()->create([
            'store_id' => $this->store->id,
            'item_id' => $this->variant->item_id,
            'item_variant_id' => $pieceVariant->id,
            'pricing_matrix' => ['price' => 5.00],
            'active' => true,
        ]);
        app(StockService::class)->receive($pieceVariant->id, $this->shelf, 40);

        $cart = $this->cart(2);
        $cart->variants()->updateExistingPivot($this->variant->id, ['extra_pieces' => 7, 'extra_piece_price' => 4]);

        $this->asSeller()
            ->post(route('seller.orders.store'), ['cart_id' => $cart->id, ...$this->cash(2 * 200 + 7 * 4)])
            ->assertSessionHasNoErrors();

        $sale = Sale::query()->with('items.storeVariant')->sole();

        $this->assertCount(2, $sale->items);
        $this->assertEqualsWithDelta(2 * 200 + 7 * 4, (float) $sale->total_amount, 0.01);
        $this->assertSame(33, app(StockService::class)->availableAtStore($pieceVariant->id, $this->store->id), 'The 7 loose pieces are held.');
        $this->assertSame(8, app(StockService::class)->availableAtStore($this->variant->id, $this->store->id));
    }

    #[Test]
    public function the_address_can_change_until_the_courier_has_the_goods(): void
    {
        $this->asSeller()->post(route('seller.orders.store'), [
            'cart_id' => $this->cart(1)->id, ...$this->cash(200), 'delivery_address' => 'Bole',
        ]);
        $sale = Sale::query()->sole();

        $this->asSeller()
            ->patch(route('seller.orders.address', ['reference' => $sale->reference_number]), ['delivery_address' => 'Piassa, near the church'])
            ->assertSessionHas('success');
        $this->assertSame('Piassa, near the church', $sale->delivery()->value('delivery_address'));

        $sale->delivery()->update(['status' => 'dispatched']);

        $this->asSeller()
            ->patch(route('seller.orders.address', ['reference' => $sale->reference_number]), ['delivery_address' => 'Megenagna'])
            ->assertSessionHas('error');
        $this->assertSame('Piassa, near the church', $sale->delivery()->value('delivery_address'));
    }

    #[Test]
    public function a_seller_cannot_pick_and_pack_another_stores_order(): void
    {
        $this->asSeller()->post(route('seller.orders.store'), ['cart_id' => $this->cart(1)->id, ...$this->cash(200)]);
        $sale = Sale::query()->with('items')->sole();
        $outsider = $this->user('seller', Store::factory()->create(['type' => Store::TYPE_RETAIL])->id);

        $this->actingAs($outsider)
            ->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])
            ->post(route('seller.orders.sourcing.confirm', $sale), [
                'lines' => [['sale_item_id' => $sale->items[0]->id, 'location_type' => StockLocation::class, 'location_id' => $this->shelf->id]],
            ])
            ->assertNotFound();

        $this->actingAs($outsider)
            ->get(route('seller.orders.pickpack', ['reference' => $sale->reference_number]))
            ->assertInertia(fn ($page) => $page->where('plan', null));

        $this->assertSame(Sale::STAGE_PICK_PACK, $sale->fresh()->fulfillment_stage);
    }

    #[Test]
    public function another_sellers_cart_cannot_be_checked_out(): void
    {
        $cart = $this->cart(1);
        $other = $this->user('seller', $this->store->id);

        $this->actingAs($other)
            ->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')])
            ->post(route('seller.orders.store'), ['cart_id' => $cart->id, ...$this->cash(200)])
            ->assertNotFound();

        $this->assertSame(0, Sale::query()->count());
    }

    #[Test]
    public function a_seller_restocks_from_hub_a_through_a_shipment_carried_by_delivery(): void
    {
        Role::firstOrCreate(['name' => 'stock_keeper']);
        $warehouse = \App\Models\Inventory\Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01']);
        $hubA = StockLocation::query()->legacy(\App\Models\Inventory\Warehouse::class, $warehouse->id)->sole();
        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        app(StockService::class)->receive($this->variant->id, $hubA, 100);

        $keeper = $this->user('stock_keeper');
        $slot = now()->addDay()->format('Y-m-d\TH:i');

        // ── The seller raises it: Hub A → their store ──
        $this->asSeller()
            ->post(route('seller.shipments.store'), [
                'origin_location_id' => $hubA->id,
                'destination_location_id' => $floor->id,
                'scheduled_for' => $slot,
            ])
            ->assertSessionHasNoErrors();

        $shipment = \App\Models\Fulfillment\Shipment::query()->sole();

        $this->asSeller()
            ->post(route('seller.shipments.items.bulk', $shipment), [
                'lines' => [['item_variant_id' => $this->variant->id, 'quantity' => 30]],
            ])
            ->assertSessionHasNoErrors();

        // ── Four-party agreement ──
        $this->as($this->courier, 'delivery')->post(route('delivery.shipments.agree', $shipment), ['slot' => $slot])->assertSessionHasNoErrors();
        $this->as($keeper, 'stockkeeper')->post(route('stock_keeper.shipments.agree', $shipment), ['party' => 'origin', 'slot' => $slot])->assertSessionHasNoErrors();
        $this->asSeller()->post(route('seller.shipments.agree', $shipment), ['party' => 'destination', 'slot' => $slot])->assertSessionHasNoErrors();

        $this->assertSame('scheduled', $shipment->fresh()->status);
        $this->assertSame($this->courier->id, (int) $shipment->fresh()->courier_id);

        // ── Hub picks and prepares the load ──
        $this->as($keeper, 'stockkeeper')->post(route('stock_keeper.shipments.step', [$shipment, 'start_picking']))->assertSessionMissing('error');
        $this->as($keeper, 'stockkeeper')->post(route('stock_keeper.shipments.step', [$shipment, 'pick_line']), ['variant_id' => $this->variant->id, 'picked' => true])->assertSessionMissing('error');
        $this->as($keeper, 'stockkeeper')->post(route('stock_keeper.shipments.step', [$shipment, 'prepared']))->assertSessionMissing('error');

        // ── Courier checks the load and signs for it: that is the handover ──
        $signature = 'data:image/png;base64,'.base64_encode(str_repeat("\x89PNG\r\n", 40));

        foreach (['courier_start' => [], 'courier_check' => [], 'courier_sign' => ['signature' => $signature]] as $step => $payload) {
            $this->as($this->courier, 'delivery')
                ->post(route('delivery.shipments.step', [$shipment, $step]), $payload)
                ->assertSessionMissing('error');
        }

        $this->assertSame([70, 30], [
            (int) ItemStock::query()->where('stock_location_id', $hubA->id)->value('quantity'),
            app(StockService::class)->inCustody($this->variant->id),
        ]);

        $this->as($this->courier, 'delivery')->post(route('delivery.shipments.step', [$shipment, 'courier_arrive']))->assertSessionMissing('error');

        // ── The seller checks the goods and signs them in ──
        $this->asSeller()->post(route('seller.shipments.step', [$shipment, 'receiver_check']))->assertSessionMissing('error');
        $this->asSeller()->post(route('seller.shipments.step', [$shipment, 'receiver_sign']), ['signature' => $signature])->assertSessionMissing('error');

        $this->assertSame('received', $shipment->fresh()->status);
        $this->assertSame(0, app(StockService::class)->inCustody($this->variant->id));
        $this->assertSame(30, (int) ItemStock::query()->where('stock_location_id', $floor->id)->where('item_variant_id', $this->variant->id)->value('quantity'));
    }

    /** @return array{parts: array<int, array{amount: float|int}>} */
    private function cash(float|int $amount): array
    {
        return ['parts' => [['amount' => $amount]]];
    }

    private function as(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => $subdomain.'.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }

    private function cart(int $quantity): Cart
    {
        $cart = Cart::create([
            'store_id' => $this->store->id,
            'user_id' => $this->seller->id,
            'seller_id' => $this->seller->id,
            'status' => 'open',
        ]);
        $cart->variants()->attach($this->variant->id, ['quantity' => $quantity, 'price' => 200, 'store_id' => $this->store->id]);

        return $cart;
    }

    private function at(StockLocation $leaf): int
    {
        return (int) ItemStock::query()->where('item_variant_id', $this->variant->id)->where('stock_location_id', $leaf->id)->value('quantity');
    }

    private function user(string $role, ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function asSeller(): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'seller.'.config('app.system_domain')]);
        $this->actingAs($this->seller, 'web');

        return $this;
    }

    private function asCourier(): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'delivery.'.config('app.system_domain')]);
        $this->actingAs($this->courier, 'web');

        return $this;
    }
}
