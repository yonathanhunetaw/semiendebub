<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Calendar\CalendarEvent;
use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Store\Store;
use App\Services\Calendar\CalendarEventService;
use App\Services\Calendar\Recurrence;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Date;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The calendar: module dates read live and scoped to the viewer's store, and
 * the calendar's own entries (repeating, private or shared, ticked off).
 */
class CalendarTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Store $otherStore;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller', 'stock_keeper', 'delivery', 'procurement'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        Date::setTestNow(CarbonImmutable::parse('2026-10-16 10:00'));
        $this->store = Store::factory()->create(['name' => 'Main Store']);
        $this->otherStore = Store::factory()->create(['name' => 'Second Store']);
    }

    protected function tearDown(): void
    {
        Date::setTestNow();
        parent::tearDown();
    }

    #[Test]
    public function every_app_with_a_calendar_opens_the_page_with_its_own_sources(): void
    {
        $cases = [
            'admin' => ['entries', 'deliveries', 'shipments', 'transfers', 'purchases', 'credit', 'site_days', 'shifts'],
            'seller' => ['entries', 'deliveries', 'shipments', 'credit', 'site_days', 'shifts'],
            'stock_keeper' => ['entries', 'shipments', 'transfers', 'purchases', 'site_days', 'shifts'],
            'delivery' => ['entries', 'deliveries', 'shipments', 'transfers'],
            'procurement' => ['entries', 'purchases'],
        ];

        foreach ($cases as $app => $sources) {
            $host = $app === 'stock_keeper' ? 'stockkeeper' : $app;
            $this->asRole($this->user($app, $app === 'admin' ? null : $this->store->id), $host)
                ->get(route("{$app}.calendar"))
                ->assertOk()
                ->assertInertia(fn ($page) => $page
                    ->component('Calendar/Index')
                    ->where('app', $app)
                    ->where('sources', fn ($legend) => collect($legend)->pluck('key')->all() === $sources));
        }
    }

    #[Test]
    public function a_seller_sees_their_stores_deliveries_and_not_another_stores(): void
    {
        $this->delivery($this->store, 'SALE-MINE', '2026-10-20 09:00');
        $this->delivery($this->otherStore, 'SALE-THEIRS', '2026-10-20 11:00');

        $this->asRole($this->user('seller', $this->store->id), 'seller')
            ->getJson(route('seller.calendar.feed', ['from' => '2026-10-01', 'to' => '2026-10-31']))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.title', 'Deliver SALE-MINE')
            ->assertJsonPath('events.0.source', 'deliveries')
            ->assertJsonPath('events.0.state', 'upcoming');
    }

    #[Test]
    public function a_courier_sees_only_the_runs_they_carry(): void
    {
        $courier = $this->user('delivery', null);
        $this->delivery($this->store, 'SALE-MINE', '2026-10-20 09:00', ['courier_id' => $courier->id, 'status' => 'dispatched']);
        $this->delivery($this->store, 'SALE-OTHER', '2026-10-20 10:00', ['status' => 'dispatched']);

        $this->asRole($courier, 'delivery')
            ->getJson(route('delivery.calendar.feed', ['from' => '2026-10-01', 'to' => '2026-10-31', 'sources' => ['deliveries']]))
            ->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.title', 'Deliver SALE-MINE');
    }

    #[Test]
    public function credit_due_dates_show_what_is_still_owed_and_turn_done_when_repaid(): void
    {
        $admin = $this->user('admin', null);
        $customer = Customer::factory()->create(['created_by' => $admin->id, 'store_id' => $this->store->id, 'credit_limit' => 5000, 'credit_days' => 30]);
        $sale = Sale::query()->create([
            'store_id' => $this->store->id, 'customer_id' => $customer->id, 'total_amount' => 800,
            'reference_number' => 'SALE-CR', 'due_date' => '2026-10-25',
        ]);
        Payment::query()->create([
            'sale_id' => $sale->id, 'kind' => Payment::KIND_SALE, 'payment_method' => Payment::METHOD_CREDIT,
            'amount' => 800, 'status' => Payment::STATUS_CONFIRMED, 'paid_at' => now(),
        ]);

        $feed = fn () => $this->asRole($admin, 'admin')
            ->getJson(route('admin.calendar.feed', ['from' => '2026-10-01', 'to' => '2026-10-31', 'sources' => ['credit']]));

        $feed()->assertOk()
            ->assertJsonCount(1, 'events')
            ->assertJsonPath('events.0.state', 'upcoming')
            ->assertJsonPath('events.0.amount', 800)
            ->assertJsonPath('events.0.start', '2026-10-25');

        Payment::query()->create([
            'customer_id' => $customer->id, 'kind' => Payment::KIND_REPAYMENT, 'payment_method' => 'cash',
            'amount' => 800, 'status' => Payment::STATUS_CONFIRMED, 'paid_at' => now(),
        ]);

        $feed()->assertOk()->assertJsonPath('events.0.state', 'done');
    }

    #[Test]
    public function a_monthly_bill_on_the_31st_falls_on_each_months_last_day_without_drifting(): void
    {
        $entry = new CalendarEvent([
            'title' => 'Rent', 'starts_at' => CarbonImmutable::parse('2026-01-31'), 'all_day' => true,
            'repeat' => CalendarEvent::REPEAT_MONTHLY, 'repeat_every' => 1,
        ]);

        $days = array_map(
            fn (array $hit): string => $hit['start']->toDateString(),
            app(Recurrence::class)->between($entry, CarbonImmutable::parse('2026-01-01'), CarbonImmutable::parse('2026-05-31 23:59')),
        );

        $this->assertSame(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31'], $days);
    }

    #[Test]
    public function a_series_stops_at_its_last_day_and_starts_counting_from_its_first(): void
    {
        $entry = new CalendarEvent([
            'title' => 'Stand-up', 'starts_at' => CarbonImmutable::parse('2026-10-05 09:00'), 'ends_at' => CarbonImmutable::parse('2026-10-05 09:15'),
            'all_day' => false, 'repeat' => CalendarEvent::REPEAT_WEEKLY, 'repeat_every' => 2, 'repeat_until' => CarbonImmutable::parse('2026-11-20'),
        ]);

        $hits = app(Recurrence::class)->between($entry, CarbonImmutable::parse('2026-10-10'), CarbonImmutable::parse('2026-12-31'));

        $this->assertSame(['2026-10-19', '2026-11-02', '2026-11-16'], array_map(fn ($h) => $h['start']->toDateString(), $hits));
        $this->assertSame('09:15', $hits[0]['end']->format('H:i'));
    }

    #[Test]
    public function a_bill_paid_today_shows_paid_today_and_due_again_next_month(): void
    {
        $seller = $this->user('seller', $this->store->id);

        $result = app(CalendarEventService::class)->recordPaidBill($seller, $this->store->id, CarbonImmutable::parse('2026-10-16'), [
            'title' => 'Internet', 'amount' => 1500, 'counterparty' => 'Ethio Telecom',
        ]);

        $this->assertSame('2026-11-16', $result['next_due']?->toDateString());

        $this->asRole($seller, 'seller')
            ->getJson(route('seller.calendar.feed', ['from' => '2026-10-01', 'to' => '2026-11-30', 'sources' => ['entries']]))
            ->assertOk()
            ->assertJsonCount(2, 'events')
            ->assertJsonPath('events.0.start', '2026-10-16')
            ->assertJsonPath('events.0.state', 'done')
            ->assertJsonPath('events.0.status', 'paid')
            ->assertJsonPath('events.0.entry.completion.by', trim("{$seller->first_name} {$seller->last_name}"))
            ->assertJsonPath('events.1.start', '2026-11-16')
            ->assertJsonPath('events.1.state', 'upcoming')
            ->assertJsonPath('events.1.amount', 1500)
            ->assertJsonPath('events.1.subtitle', 'Ethio Telecom');
    }

    #[Test]
    public function the_page_adds_a_bill_already_paid_and_ticks_the_next_one_off(): void
    {
        $seller = $this->user('seller', $this->store->id);

        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.entries.store'), [
                'title' => 'Electricity', 'kind' => 'bill', 'visibility' => 'shared', 'starts_at' => '2026-10-16',
                'all_day' => true, 'repeat' => 'monthly', 'repeat_every' => 1, 'amount' => 900, 'currency' => 'ETB', 'paid_now' => true,
            ])
            ->assertSessionHas('success');

        $entry = CalendarEvent::query()->sole();
        $this->assertSame($this->store->id, $entry->store_id);
        $this->assertSame(1, $entry->completions()->count());

        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.entries.complete', $entry), ['occurs_on' => '2026-11-16', 'done' => true])
            ->assertSessionHas('success');
        $this->assertSame(2, $entry->completions()->count());

        // A day the bill does not fall on cannot be ticked.
        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.entries.complete', $entry), ['occurs_on' => '2026-11-17', 'done' => true])
            ->assertSessionHas('error');

        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.entries.complete', $entry), ['occurs_on' => '2026-11-16', 'done' => false]);
        $this->assertSame(1, $entry->completions()->count());
    }

    #[Test]
    public function private_entries_stay_with_their_creator_and_shared_ones_with_their_store(): void
    {
        $author = $this->user('seller', $this->store->id);
        $colleague = $this->user('seller', $this->store->id);
        $elsewhere = $this->user('seller', $this->otherStore->id);
        $service = app(CalendarEventService::class);

        $base = ['kind' => 'reminder', 'starts_at' => '2026-10-20', 'all_day' => true, 'repeat' => 'none'];
        $service->create($author, $this->store->id, $base + ['title' => 'Mine only', 'visibility' => 'private']);
        $service->create($author, $this->store->id, $base + ['title' => 'Store meeting', 'visibility' => 'shared']);
        $service->create($this->user('admin', null), null, $base + ['title' => 'Holiday', 'visibility' => 'shared']);

        $titles = fn (User $user) => collect(
            $this->asRole($user, 'seller')
                ->getJson(route('seller.calendar.feed', ['from' => '2026-10-01', 'to' => '2026-10-31', 'sources' => ['entries']]))
                ->assertOk()
                ->json('events'),
        )->pluck('title')->sort()->values()->all();

        $this->assertSame(['Holiday', 'Mine only', 'Store meeting'], $titles($author));
        $this->assertSame(['Holiday', 'Store meeting'], $titles($colleague));
        $this->assertSame(['Holiday'], $titles($elsewhere));
    }

    #[Test]
    public function only_the_creator_or_an_admin_may_change_an_entry(): void
    {
        $author = $this->user('seller', $this->store->id);
        $colleague = $this->user('seller', $this->store->id);
        $entry = app(CalendarEventService::class)->create($author, $this->store->id, [
            'title' => 'Stocktake', 'kind' => 'meeting', 'visibility' => 'shared', 'starts_at' => '2026-10-20', 'all_day' => true, 'repeat' => 'none',
        ]);

        $this->asRole($colleague, 'seller')
            ->delete(route('seller.calendar.entries.destroy', $entry))
            ->assertForbidden();

        $this->asRole($this->user('admin', null), 'admin')
            ->put(route('admin.calendar.entries.update', $entry), [
                'title' => 'Stocktake (moved)', 'kind' => 'meeting', 'visibility' => 'shared', 'starts_at' => '2026-10-21',
                'all_day' => true, 'repeat' => 'none',
            ])
            ->assertSessionHas('success');

        $this->assertSame('Stocktake (moved)', $entry->refresh()->title);
        $this->assertSame('2026-10-21', $entry->starts_at->toDateString());

        $this->asRole($author, 'seller')->delete(route('seller.calendar.entries.destroy', $entry))->assertSessionHas('success');
        $this->assertModelMissing($entry);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    /** @param array<string, mixed> $attributes */
    private function delivery(Store $store, string $reference, string $at, array $attributes = []): Delivery
    {
        $sale = Sale::query()->create(['store_id' => $store->id, 'total_amount' => 100, 'reference_number' => $reference]);

        return Delivery::query()->create(array_merge([
            'sale_id' => $sale->id,
            'source_store_id' => $store->id,
            'tracking_number' => 'TRK-'.$reference,
            'status' => 'pending',
            'recipient_name' => 'Abebe',
            'delivery_address' => 'Bole',
            'scheduled_for' => CarbonImmutable::parse($at),
        ], $attributes));
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
