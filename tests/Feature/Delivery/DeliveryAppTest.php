<?php

declare(strict_types=1);

namespace Tests\Feature\Delivery;

use App\Models\Auth\User;
use App\Models\Fulfillment\Delivery;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Sales\Sale;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\Fulfillment\OrderSourcingService;
use App\Services\Inventory\StockLocationTree;
use App\Services\ShipmentWorkflowService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The Delivery app: the courier's customer runs, transfers and freight, plus
 * profile, sessions and the history list.
 */
class DeliveryAppTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private ItemVariant $variant;

    private User $courier;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'delivery', 'stock_keeper', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $item = Item::factory()->create(['status' => 'active']);
        $this->variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $this->variant->id, 'active' => true]);
        app(StockService::class)->receive($this->variant->id, $this->shelf, 50);

        $this->courier = $this->user('delivery');

        $this->withServerVariables(['HTTP_HOST' => 'delivery.'.config('app.system_domain')]);
        $this->actingAs($this->courier);
    }

    private function user(string $role, ?int $storeId = null, array $overrides = []): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId] + $overrides);
        $user->assignRole($role);

        return $user->refresh();
    }

    /** A delivery order. `picked` means Pick & Pack has handed it over, so it can be collected. */
    private function order(bool $picked = true, string $address = 'Bole'): Delivery
    {
        $cart = Cart::create(['store_id' => $this->store->id, 'status' => 'open']);
        $cart->variants()->attach($this->variant->id, ['quantity' => 1, 'price' => 100, 'store_id' => $this->store->id]);
        $sale = app(CheckoutService::class)->checkout($cart, ['payment_method' => 'cash'], null, ['delivery_address' => $address]);

        if ($picked) {
            app(OrderSourcingService::class)->confirmSourcing($sale->fresh(), $sale->items->map(fn ($i) => [
                'sale_item_id' => $i->id, 'location_type' => StockLocation::class, 'location_id' => $this->shelf->id,
            ])->all());
        }

        return Delivery::query()->where('sale_id', $sale->id)->sole();
    }

    private function claimed(): Delivery
    {
        $run = $this->order();
        $this->post(route('delivery.delivery.claim', $run))->assertSessionHas('success');

        return $run->fresh();
    }

    // ---- Customer runs -----------------------------------------------------

    #[Test]
    public function the_dashboard_shows_my_next_runs_and_runs_up_for_grabs(): void
    {
        $mine = $this->claimed();
        $open = $this->order();

        $this->get(route('delivery.dashboard'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Delivery/Dashboard/index')
                ->where('up_next', fn ($rows) => count($rows) === 1)
                ->where('available_runs', fn ($rows) => count($rows) === 1)
                ->where('metrics.assigned', 1));
    }

    #[Test]
    public function the_run_list_filters_and_searches(): void
    {
        $this->claimed();

        $this->get(route('delivery.delivery.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Delivery/Delivery/index')->where('filters.status', 'open')->where('pagination.total', 1));
        $this->get(route('delivery.delivery.index', ['status' => 'delivered']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('pagination.total', 0));
        $this->get(route('delivery.delivery.index', ['search' => 'zzz-no-such-order']))->assertOk()
            ->assertInertia(fn ($page) => $page->where('pagination.total', 0));
    }

    #[Test]
    public function a_courier_claims_a_picked_run_but_not_one_still_being_picked(): void
    {
        $early = $this->order(picked: false);
        $this->post(route('delivery.delivery.claim', $early))->assertSessionHas('error');
        $this->assertNull($early->fresh()->courier_id);

        $ready = $this->order();
        $this->post(route('delivery.delivery.claim', $ready))->assertSessionHas('success');
        $this->assertSame($this->courier->id, (int) $ready->fresh()->courier_id);
    }

    #[Test]
    public function a_run_taken_by_someone_else_cannot_be_claimed_again(): void
    {
        $run = $this->order();
        $other = $this->user('delivery');
        $this->actingAs($other);
        $this->post(route('delivery.delivery.claim', $run))->assertSessionHas('success');

        $this->actingAs($this->courier);
        $this->post(route('delivery.delivery.claim', $run))->assertSessionHas('error');

        $this->assertSame($other->id, (int) $run->fresh()->courier_id);
    }

    #[Test]
    public function a_courier_takes_a_run_through_to_delivered(): void
    {
        $run = $this->claimed();

        foreach (['dispatched', 'in_transit', 'delivered'] as $status) {
            $this->patch(route('delivery.delivery.transition', $run), ['status' => $status])->assertSessionHas('success');
            $this->assertSame($status, $run->fresh()->status);
        }
    }

    #[Test]
    public function a_run_cannot_skip_a_stage_or_move_on_from_delivered(): void
    {
        $run = $this->claimed();

        $this->patch(route('delivery.delivery.transition', $run), ['status' => 'delivered'])->assertSessionHas('error');
        $this->assertSame('pending', $run->fresh()->status);

        foreach (['dispatched', 'in_transit', 'delivered'] as $status) {
            $this->patch(route('delivery.delivery.transition', $run), ['status' => $status]);
        }
        $this->patch(route('delivery.delivery.transition', $run), ['status' => 'dispatched'])->assertSessionHas('error');
        $this->assertSame('delivered', $run->fresh()->status);
    }

    #[Test]
    public function a_failed_run_must_say_why_and_the_reason_is_kept(): void
    {
        $run = $this->claimed();
        $this->patch(route('delivery.delivery.transition', $run), ['status' => 'dispatched']);

        $this->patch(route('delivery.delivery.transition', $run), ['status' => 'failed'])->assertSessionHasErrors('failure_reason');
        $this->assertSame('dispatched', $run->fresh()->status);

        $this->patch(route('delivery.delivery.transition', $run), ['status' => 'failed', 'failure_reason' => 'Nobody home'])
            ->assertSessionHas('success');
        $this->assertSame('failed', $run->fresh()->status);
    }

    #[Test]
    public function an_unknown_status_is_rejected(): void
    {
        $run = $this->claimed();

        $this->patch(route('delivery.delivery.transition', $run), ['status' => 'teleported'])->assertSessionHasErrors('status');
        $this->patch(route('delivery.delivery.transition', $run), [])->assertSessionHasErrors('status');
    }

    #[Test]
    public function a_courier_cannot_move_someone_elses_run(): void
    {
        $run = $this->order();
        $other = $this->user('delivery');
        $this->actingAs($other);
        $this->post(route('delivery.delivery.claim', $run));

        $this->actingAs($this->courier);
        $this->patch(route('delivery.delivery.transition', $run), ['status' => 'dispatched'])->assertSessionHas('error');

        $this->assertSame('pending', $run->fresh()->status);
    }

    #[Test]
    public function the_history_lists_only_finished_runs_and_can_be_searched(): void
    {
        $run = $this->claimed();
        $this->get(route('delivery.history.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Delivery/History/index')->where('pagination.total', 0));

        foreach (['dispatched', 'in_transit', 'delivered'] as $status) {
            $this->patch(route('delivery.delivery.transition', $run), ['status' => $status]);
        }

        $this->get(route('delivery.history.index'))->assertInertia(fn ($page) => $page->where('pagination.total', 1));
        $this->get(route('delivery.history.index', ['search' => 'zzz-no-such-order']))->assertInertia(fn ($page) => $page->where('pagination.total', 0));
    }

    // ---- Transfers ---------------------------------------------------------

    /** A pending remote-hub → floor transfer raised by an admin; it leaves the site, so a courier carries it. */
    private function transfer(): Transfer
    {
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        app(StockService::class)->receive($this->variant->id, $remote, 20);

        $admin = $this->user('admin');
        $this->actingAs($admin)->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->post(route('admin.inventory.transfers.store'), [
            'item_variant_id' => $this->variant->id, 'quantity' => 8,
            'source_location_type' => StockLocation::class, 'source_location_id' => $remote->id,
            'destination_location_type' => StockLocation::class, 'destination_location_id' => $floor->id,
        ])->assertSessionHasNoErrors();

        $this->actingAs($this->courier)->withServerVariables(['HTTP_HOST' => 'delivery.'.config('app.system_domain')]);

        return Transfer::query()->latest('id')->firstOrFail();
    }

    #[Test]
    public function the_transfer_board_splits_mine_from_those_up_for_grabs(): void
    {
        $transfer = $this->transfer();

        $this->get(route('delivery.transfers.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Delivery/Transfers/index')->where('counts.available', 1)->where('counts.mine', 0));

        $this->post(route('delivery.transfers.claim', $transfer))->assertSessionHas('success');

        $this->get(route('delivery.transfers.index', ['tab' => 'mine']))
            ->assertInertia(fn ($page) => $page->where('counts.mine', 1)->where('transfers', fn ($rows) => count($rows) === 1));
        $this->get(route('delivery.transfers.index', ['tab' => 'available']))
            ->assertInertia(fn ($page) => $page->where('transfers', fn ($rows) => count($rows) === 0));
    }

    #[Test]
    public function a_transfer_already_carried_by_someone_else_cannot_be_claimed(): void
    {
        $transfer = $this->transfer();
        $other = $this->user('delivery');
        $this->actingAs($other)->post(route('delivery.transfers.claim', $transfer))->assertSessionHas('success');

        $this->actingAs($this->courier)->post(route('delivery.transfers.claim', $transfer))->assertSessionHas('error');

        $this->assertSame($other->id, (int) $transfer->fresh()->courier_id);
    }

    #[Test]
    public function a_courier_hands_over_only_a_transfer_they_collected_and_it_lands(): void
    {
        $transfer = $this->transfer();
        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();

        // Not mine yet.
        $this->post(route('delivery.transfers.handover', $transfer))->assertSessionHas('error');

        $this->post(route('delivery.transfers.claim', $transfer));
        // Mine, but nobody has handed it to me at the origin.
        $this->post(route('delivery.transfers.handover', $transfer))->assertSessionHas('error');
        $this->assertSame('pending', $transfer->fresh()->status);

        app(\App\Services\TransferWorkflowService::class)->markDispatched($transfer->fresh());
        $this->post(route('delivery.transfers.handover', $transfer))->assertSessionHas('success');

        $this->assertSame('completed', $transfer->fresh()->status);
        $this->assertSame(8, (int) \App\Models\StockKeeper\ItemStock::query()->where('stock_location_id', $floor->id)->sum('quantity'));
    }

    // ---- Freight -----------------------------------------------------------

    private function freight(): Shipment
    {
        $origin = Store::factory()->create(['type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $destination = Store::factory()->create(['type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $workflow = app(ShipmentWorkflowService::class);
        $shipment = $workflow->create($origin->id, $destination->id, [], $this->user('admin')->id);
        $workflow->addItem($shipment->fresh(), $this->variant, 5, ['cbm' => 1, 'weight_kg' => 10]);

        return $shipment->fresh();
    }

    #[Test]
    public function a_freight_run_cannot_be_claimed_before_it_is_dispatched(): void
    {
        $shipment = $this->freight();

        $this->post(route('delivery.shipments.claim', $shipment))->assertSessionHas('error');

        $this->assertNull($shipment->fresh()->courier_id);
    }

    #[Test]
    public function a_courier_claims_a_dispatched_freight_run_once(): void
    {
        $shipment = $this->freight();
        $shipment->forceFill(['status' => ShipmentWorkflowService::DISPATCHED])->save();

        $this->get(route('delivery.shipments.index', ['tab' => 'available']))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Delivery/Shipments/index')->where('available_count', 1));

        $this->post(route('delivery.shipments.claim', $shipment))->assertSessionHas('success');
        $this->assertSame($this->courier->id, (int) $shipment->fresh()->courier_id);

        $other = $this->user('delivery');
        $this->actingAs($other)->post(route('delivery.shipments.claim', $shipment))->assertSessionHas('error');
        $this->assertSame($this->courier->id, (int) $shipment->fresh()->courier_id);
    }

    // ---- Profile, sessions, welcome ---------------------------------------

    #[Test]
    public function the_profile_page_shows_the_courier_and_their_numbers(): void
    {
        $this->get(route('delivery.profile.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Delivery/Profile/index')
                ->where('courier.id', $this->courier->id)
                ->has('metrics'));
    }

    #[Test]
    public function a_courier_updates_their_profile_and_may_keep_their_own_email_and_phone(): void
    {
        $this->courier->update(['phone_number' => '0911222333']);

        $this->patch(route('delivery.profile.update'), [
            'first_name' => 'Chala', 'last_name' => 'M', 'email' => $this->courier->email, 'phone_number' => '0911222333',
        ])->assertSessionHasNoErrors()->assertSessionHas('success');

        $this->assertSame('Chala', $this->courier->fresh()->first_name);
    }

    #[Test]
    public function a_profile_needs_a_name_and_email_and_cannot_take_anothers_email_or_phone(): void
    {
        $other = $this->user('delivery', null, ['email' => 'taken@example.com', 'phone_number' => '0911999888']);

        $this->patch(route('delivery.profile.update'), [])->assertSessionHasErrors(['first_name', 'email']);
        $this->patch(route('delivery.profile.update'), [
            'first_name' => 'X', 'email' => 'taken@example.com', 'phone_number' => '0911999888',
        ])->assertSessionHasErrors(['email', 'phone_number']);
        $this->patch(route('delivery.profile.update'), [
            'first_name' => 'X', 'email' => $this->courier->email, 'phone_number' => str_repeat('1', 16),
        ])->assertSessionHasErrors('phone_number');
    }

    private function seedSession(string $id, int $userId): void
    {
        DB::table('sessions')->insert([
            'id' => $id, 'user_id' => $userId, 'ip_address' => '10.0.0.1', 'user_agent' => 'phpunit',
            'payload' => base64_encode(serialize([])), 'last_activity' => now()->timestamp,
        ]);
    }

    #[Test]
    public function the_session_list_shows_only_my_own_sessions(): void
    {
        $this->seedSession('mine', $this->courier->id);
        $this->seedSession('theirs', $this->user('delivery')->id);

        $this->get(route('delivery.sessions.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Delivery/Sessions/index')
                ->where('sessions', fn ($rows) => collect($rows)->pluck('id')->all() === ['mine']));
    }

    #[Test]
    public function a_courier_signs_out_their_own_session_but_not_anothers(): void
    {
        $this->seedSession('mine', $this->courier->id);
        $this->seedSession('theirs', $this->user('delivery')->id);

        $this->delete(route('delivery.sessions.destroy', 'theirs'))->assertRedirect();
        $this->assertDatabaseHas('sessions', ['id' => 'theirs']);

        $this->delete(route('delivery.sessions.destroy', 'mine'))->assertRedirect();
        $this->assertDatabaseMissing('sessions', ['id' => 'mine']);
    }

    #[Test]
    public function a_guest_sees_the_delivery_welcome_page_and_the_app_is_closed_to_guests(): void
    {
        auth()->logout();
        $this->app['auth']->forgetGuards();

        $this->get(route('delivery.welcome'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Delivery/Welcome/index'));
        $this->get(route('delivery.dashboard'))->assertRedirect(route('delivery.login'));
        $this->get(route('delivery.delivery.index'))->assertRedirect(route('delivery.login'));
        $this->get(route('delivery.profile.index'))->assertRedirect(route('delivery.login'));
    }
}
