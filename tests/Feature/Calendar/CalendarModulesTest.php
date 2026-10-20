<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use App\Models\StockKeeper\Transfer;
use App\Models\Finance\Expense;
use App\Models\Workforce\PublicHoliday;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Models\Workforce\TimeEntry;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Module dates on the calendar on the shops' clock (Addis Ababa, UTC+3, while
 * the app runs in UTC), and starting things from a day.
 */
class CalendarModulesTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.business_timezone' => 'Africa/Addis_Ababa']);

        foreach (['admin', 'seller', 'stock_keeper', 'delivery', 'procurement', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        // 01:00 on Tuesday 20 October in Addis: still the 19th in UTC.
        Date::setTestNow(CarbonImmutable::parse('2026-10-19 22:00', 'UTC'));
        $this->store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL]);
    }

    protected function tearDown(): void
    {
        Date::setTestNow();
        parent::tearDown();
    }

    #[Test]
    public function a_transfer_planned_for_a_day_shows_as_that_whole_shops_day(): void
    {
        $admin = $this->user('admin', null);
        $remote = app(StockLocationTree::class)->addRemoteHub($this->store);
        $floor = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $variant = ItemVariant::factory()->create();
        app(StockService::class)->receive($variant->id, $remote, 20);

        $fields = [
            'item_variant_id' => $variant->id,
            'quantity' => 4,
            'source_location_type' => StockLocation::class,
            'source_location_id' => $remote->id,
            'destination_location_type' => StockLocation::class,
            'destination_location_id' => $floor->id,
        ];

        // Yesterday on the shops' clock is refused; today (the 20th, though UTC says the 19th) is fine.
        $this->asRole($admin, 'admin')->post(route('admin.inventory.transfers.store'), $fields + ['eta' => '2026-10-19'])->assertSessionHasErrors('eta');
        $this->post(route('admin.inventory.transfers.store'), $fields + ['eta' => '2026-10-20'])->assertSessionHasNoErrors();

        $transfer = Transfer::query()->sole();
        $this->assertSame('2026-10-19 21:00:00', $transfer->eta->utc()->format('Y-m-d H:i:s'));

        $this->get(route('admin.inventory.transfers.show', $transfer))
            ->assertInertia(fn ($page) => $page->where('transfer.eta', '2026-10-20'));

        $this->getJson(route('admin.calendar.feed', ['from' => '2026-10-20', 'to' => '2026-10-20', 'sources' => ['transfers']]))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.start', '2026-10-20')
            ->assertJsonPath('events.0.all_day', true)
            ->assertJsonPath('events.0.state', 'upcoming');
    }

    #[Test]
    public function the_feed_reaches_the_early_hours_of_a_shops_day(): void
    {
        // 01:30 Addis on the 21st is 22:30 UTC on the 20th.
        $sale = Sale::query()->create(['store_id' => $this->store->id, 'total_amount' => 100, 'reference_number' => 'SALE-EARLY']);
        Delivery::query()->create([
            'sale_id' => $sale->id,
            'source_store_id' => $this->store->id,
            'tracking_number' => 'TRK-EARLY',
            'status' => 'pending',
            'recipient_name' => 'Abebe',
            'delivery_address' => 'Bole',
            'scheduled_for' => CarbonImmutable::parse('2026-10-20 22:30', 'UTC'),
        ]);

        $this->asRole($this->user('seller', $this->store->id), 'seller')
            ->getJson(route('seller.calendar.feed', ['from' => '2026-10-21', 'to' => '2026-10-21', 'sources' => ['deliveries']]))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.title', 'Deliver SALE-EARLY');
    }

    #[Test]
    public function a_supplier_installment_shows_on_its_due_day_once_in_the_orders_currency(): void
    {
        $supplier = Supplier::factory()->create(['currency' => 'USD', 'name' => 'Shenzhen Goods']);
        $buyer = $this->user('procurement', null);
        $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active'])->id]);

        $this->asRole($buyer, 'procurement')->post(route('procurement.purchase_orders.store'), [
            'supplier_id' => $supplier->id,
            'store_id' => $this->store->id,
            'currency' => 'USD',
            'exchange_rate' => 125,
            'payment_terms' => 'fixed_date',
            'payment_days' => 30,
            'payment_anchor' => 'order',
            'lines' => [['item_variant_id' => $variant->id, 'quantity' => 10, 'unit_price' => 100]],
        ])->assertSessionHasNoErrors();
        $purchase = Purchase::query()->sole();
        $this->post(route('procurement.purchase_orders.submit', $purchase))->assertSessionHas('success');
        $this->asRole($this->user('procurement', null), 'procurement')->post(route('procurement.purchase_orders.approve', $purchase))->assertSessionHas('success');
        $this->asRole($buyer, 'procurement')->post(route('procurement.purchase_orders.ordered', $purchase), ['ordered_at' => '2026-10-01']);
        $this->assertNotNull($purchase->payable()->first());

        $payments = fn () => collect($this->getJson(route('procurement.calendar.feed', ['from' => '2026-10-26', 'to' => '2026-11-05', 'sources' => ['purchases']]))
            ->assertOk()->json('events'))->where('kind', 'supplier_payment')->values();

        // Once (the old payment-days guess stays away), due 30 days after the order, in dollars.
        $this->assertCount(1, $payments());
        $this->assertSame('2026-10-31', $payments()[0]['start']);
        $this->assertSame('Pay Shenzhen Goods', $payments()[0]['title']);
        $this->assertSame('USD', $payments()[0]['currency']);
        $this->assertSame(1000.0, (float) $payments()[0]['amount']);
        $this->assertSame('upcoming', $payments()[0]['state']);

        Date::setTestNow(CarbonImmutable::parse('2026-11-02 08:00', 'UTC'));
        $this->assertSame('late', $payments()[0]['state']);
    }

    #[Test]
    public function a_driver_sees_their_own_shifts_on_the_delivery_calendar(): void
    {
        $driver = $this->user('delivery', null);
        $site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->sole();
        Shift::query()->create([
            'stock_location_id' => $site->id,
            'user_id' => $driver->id,
            'starts_at' => CarbonImmutable::parse('2026-10-21 05:00', 'UTC'),
            'ends_at' => CarbonImmutable::parse('2026-10-21 13:00', 'UTC'),
            'duty' => Shift::DUTY_NONE,
            'status' => Shift::STATUS_PUBLISHED,
        ]);

        $this->asRole($driver, 'delivery')
            ->getJson(route('delivery.calendar.feed', ['from' => '2026-10-21', 'to' => '2026-10-21', 'sources' => ['shifts']]))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.title', 'My shift 08:00–16:00');
    }

    #[Test]
    public function each_app_offers_only_what_its_people_may_start_from_a_day(): void
    {
        $starters = function (string $app, User $user): array {
            $host = $app === 'stock_keeper' ? 'stockkeeper' : $app;
            $keys = [];
            $this->asRole($user, $host)->get(route("{$app}.calendar"))->assertOk()
                ->assertInertia(function ($page) use (&$keys) {
                    $keys = collect($page->toArray()['props']['starters'])->pluck('key')->all();

                    return $page;
                });

            return $keys;
        };

        $admin = $starters('admin', $this->user('admin', null));
        foreach (['transfer', 'shipment', 'purchase_order', 'leave'] as $key) {
            $this->assertContains($key, $admin);
        }
        $site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->sole();
        $this->assertContains("shift:{$site->id}", $admin, 'a global admin manages every site, so may add shifts');

        $seller = $starters('seller', $this->user('seller', $this->store->id));
        $this->assertSame(['shipment', 'leave'], $seller);

        $keeper = $starters('stock_keeper', $this->user('stock_keeper', $this->store->id));
        $this->assertSame(['transfer', 'leave'], $keeper);

        $this->assertSame(['purchase_order'], $starters('procurement', $this->user('procurement', null)));
        $this->assertSame([], $starters('delivery', $this->user('delivery', null)), 'drivers start only notes');
    }

    #[Test]
    public function a_shift_starter_opens_the_rota_on_that_week(): void
    {
        $site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->sole();

        $this->asRole($this->user('admin', null), 'admin')->get(route('admin.calendar'))
            ->assertInertia(fn ($page) => $page
                ->where('starters', fn ($list) => collect($list)->contains(fn ($s) => $s['key'] === "shift:{$site->id}"
                    && $s['url'] === route('admin.work.rota', ['site' => $site->id])
                    && $s['date_params'] === ['date', 'week'])));
    }

    #[Test]
    public function a_shipment_shows_at_the_time_it_was_typed_on_the_shops_clock(): void
    {
        $seller = $this->user('seller', $this->store->id);
        \App\Models\Fulfillment\Shipment::query()->create([
            'reference' => 'SHP-CLOCK',
            'origin_store_id' => $this->store->id,
            'destination_store_id' => $this->store->id,
            'status' => 'pending',
            // The module stores what was typed: 09:00 in the shop.
            'scheduled_for' => '2026-10-22 09:00:00',
        ]);

        $this->asRole($seller, 'seller')
            ->getJson(route('seller.calendar.feed', ['from' => '2026-10-22', 'to' => '2026-10-22', 'sources' => ['shipments']]))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            // 09:00 Addis is 06:00 UTC.
            ->assertJsonPath('events.0.start', '2026-10-22T06:00:00+00:00');
    }

    #[Test]
    public function the_stores_staff_or_its_courier_move_a_delivery_before_it_is_on_the_road(): void
    {
        $delivery = $this->openDelivery('SALE-MOVE', '2026-10-22 06:00');
        $seller = $this->user('seller', $this->store->id);
        $other = $this->user('seller', Store::factory()->create()->id);

        // Another store's seller can't reach it; a past day is refused.
        $this->asRole($other, 'seller')->post(route('seller.calendar.deliveries.schedule', $delivery), ['scheduled_for' => '2026-10-23T10:30'])->assertNotFound();
        $this->asRole($seller, 'seller')->post(route('seller.calendar.deliveries.schedule', $delivery), ['scheduled_for' => '2026-10-19T10:30'])->assertSessionHasErrors('scheduled_for');

        // 10:30 in the shop is 07:30 UTC; who moved it is kept.
        $this->post(route('seller.calendar.deliveries.schedule', $delivery), ['scheduled_for' => '2026-10-23T10:30'])->assertSessionHas('success');
        $delivery->refresh();
        $this->assertSame('2026-10-23 07:30', $delivery->scheduled_for->utc()->format('Y-m-d H:i'));
        $this->assertSame($seller->id, $delivery->scheduled_by);

        $this->getJson(route('seller.calendar.feed', ['from' => '2026-10-23', 'to' => '2026-10-23', 'sources' => ['deliveries']]))
            ->assertJsonPath('events.0.delivery.scheduled_for', '2026-10-23T10:30')
            ->assertJsonPath('events.0.delivery.can_schedule', true);

        // The courier carrying it may move it; another courier can't.
        $courier = $this->user('delivery', null);
        $delivery->update(['courier_id' => $courier->id]);
        $this->asRole($this->user('delivery', null), 'delivery')->post(route('delivery.calendar.deliveries.schedule', $delivery), ['scheduled_for' => '2026-10-24T09:00'])->assertNotFound();
        $this->asRole($courier, 'delivery')->post(route('delivery.calendar.deliveries.schedule', $delivery), ['scheduled_for' => '2026-10-24T09:00'])->assertSessionHas('success');

        // On the road: the day stays.
        $delivery->update(['status' => 'in_transit']);
        $this->post(route('delivery.calendar.deliveries.schedule', $delivery), ['scheduled_for' => '2026-10-25T09:00'])->assertNotFound();
        $this->assertSame('2026-10-24 06:00', $delivery->refresh()->scheduled_for->utc()->format('Y-m-d H:i'));
    }

    #[Test]
    public function a_shift_on_offer_says_who_it_was_offered_to(): void
    {
        $seller = $this->user('seller', $this->store->id);
        $colleague = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id, 'first_name' => 'Hana']);
        $colleague->assignRole('seller');
        $site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->sole();
        $shift = Shift::query()->create([
            'stock_location_id' => $site->id,
            'user_id' => $seller->id,
            'starts_at' => CarbonImmutable::parse('2026-10-23 05:00', 'UTC'),
            'ends_at' => CarbonImmutable::parse('2026-10-23 13:00', 'UTC'),
            'duty' => Shift::DUTY_NONE,
            'status' => Shift::STATUS_ACCEPTED,
        ]);
        ShiftSwap::query()->create(['shift_id' => $shift->id, 'from_id' => $seller->id, 'to_id' => $colleague->id, 'status' => ShiftSwap::STATUS_OFFERED]);

        $subtitle = $this->asRole($seller, 'seller')
            ->getJson(route('seller.calendar.feed', ['from' => '2026-10-23', 'to' => '2026-10-23', 'sources' => ['shifts']]))
            ->assertOk()
            ->json('events.0.subtitle');
        $this->assertStringContainsString('swap offered to Hana', (string) $subtitle);
    }

    #[Test]
    public function public_holidays_show_on_every_app(): void
    {
        PublicHoliday::query()->create(['date' => '2026-10-22', 'name' => 'Founders Day']);

        $this->asRole($this->user('procurement', null), 'procurement')
            ->getJson(route('procurement.calendar.feed', ['from' => '2026-10-19', 'to' => '2026-10-25', 'sources' => ['holidays']]))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.title', 'Founders Day')
            ->assertJsonPath('events.0.start', '2026-10-22')
            ->assertJsonPath('events.0.all_day', true);
    }

    #[Test]
    public function overtime_waiting_for_a_decision_shows_to_who_may_decide_and_not_to_the_worker(): void
    {
        $seller = $this->user('seller', $this->store->id);
        $site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->sole();
        // Ten hours on Tuesday 20 October (08:00–18:00 in the shop): two of them overtime.
        TimeEntry::query()->create([
            'user_id' => $seller->id,
            'stock_location_id' => $site->id,
            'clock_in_at' => CarbonImmutable::parse('2026-10-20 05:00', 'UTC'),
            'clock_out_at' => CarbonImmutable::parse('2026-10-20 15:00', 'UTC'),
            'in_method' => TimeEntry::METHOD_QR,
            'out_method' => TimeEntry::METHOD_QR,
            'flags' => [],
        ]);
        $feed = ['from' => '2026-10-19', 'to' => '2026-10-25', 'sources' => ['overtime']];

        $this->asRole($this->user('admin', null), 'admin')->getJson(route('admin.calendar.feed', $feed))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.start', '2026-10-20')
            ->assertJsonPath('events.0.status', 'pending');

        $this->asRole($seller, 'seller')->getJson(route('seller.calendar.feed', $feed))->assertOk()->assertJsonCount(0, 'events');
    }

    #[Test]
    public function an_expense_waits_on_the_calendar_for_a_second_person_to_confirm_it(): void
    {
        $recorder = $this->user('admin', null);
        Expense::query()->create([
            'store_id' => $this->store->id,
            'category' => 'fuel',
            'amount' => 500,
            'currency' => 'ETB',
            'spent_on' => '2026-10-20',
            'description' => 'Fuel for the van',
            'status' => Expense::STATUS_CLAIMED,
            'recorded_by' => $recorder->id,
        ]);
        $feed = ['from' => '2026-10-19', 'to' => '2026-10-25', 'sources' => ['expenses']];

        $this->asRole($this->user('admin', null), 'admin')->getJson(route('admin.calendar.feed', $feed))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.title', 'Confirm Fuel')
            ->assertJsonPath('events.0.amount', 500);

        // Not to the one who recorded it, nor to a store admin (who may not confirm).
        $this->asRole($recorder, 'admin')->getJson(route('admin.calendar.feed', $feed))->assertJsonCount(0, 'events');
        $this->asRole($this->user('admin', $this->store->id), 'admin')->getJson(route('admin.calendar.feed', $feed))->assertJsonCount(0, 'events');
    }

    private function openDelivery(string $reference, string $utc): Delivery
    {
        $sale = Sale::query()->create(['store_id' => $this->store->id, 'total_amount' => 100, 'reference_number' => $reference]);

        return Delivery::query()->create([
            'sale_id' => $sale->id,
            'source_store_id' => $this->store->id,
            'tracking_number' => 'TRK-'.$reference,
            'status' => 'pending',
            'recipient_name' => 'Abebe',
            'delivery_address' => 'Bole',
            'scheduled_for' => CarbonImmutable::parse($utc, 'UTC'),
        ]);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user;
    }

    private function asRole(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => "{$subdomain}.localhost"]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
