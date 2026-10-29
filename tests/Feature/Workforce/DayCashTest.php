<?php

declare(strict_types=1);

namespace Tests\Feature\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\SiteDay;
use App\Services\Finance\DayCash;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The day-end cash close: the till is counted against opening float + cash taken
 * - cash handed over; a difference nobody explains stops the closing; a closed
 * day's cash is frozen and later confirmations or handovers never change it.
 */
class DayCashTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $site;

    private User $manager;

    private User $seller;

    private int $reference = 0;

    protected function setUp(): void
    {
        parent::setUp();

        config(['app.business_timezone' => 'Africa/Addis_Ababa']);
        foreach (['seller', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        $this->site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        app(Sites::class)->saveWeek($this->site, collect(range(0, 6))->map(fn (int $d): array => [
            'weekday' => $d, 'closed' => false, 'opens_at' => '08:30', 'closes_at' => '19:00',
        ])->all());

        $this->manager = $this->user('store_manager');
        $this->seller = $this->user('seller');
        $keys = app(KeyCustodyService::class);
        $keys->force($keys->keyFor($this->site), $this->manager, $this->seller, 'First holder');
    }

    private function user(string $role): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $this->store->id]);
        $user->assignRole($role);

        return $user;
    }

    private function at(string $wallClock): void
    {
        $this->travelTo(CarbonImmutable::parse($wallClock, 'Africa/Addis_Ababa')->utc());
    }

    private function open(string $wallClock, ?float $float = 1000.0): SiteDay
    {
        $this->at($wallClock);

        return app(SiteDayService::class)->open($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site), [], $float);
    }

    private function cashSale(string $wallClock, float $amount, string $status = Payment::STATUS_CLAIMED): Payment
    {
        $this->at($wallClock);
        $sale = Sale::query()->create(['store_id' => $this->store->id, 'total_amount' => $amount, 'reference_number' => 'CASH-'.(++$this->reference)]);

        return Payment::query()->create([
            'sale_id' => $sale->id, 'payment_method' => Payment::METHOD_CASH, 'amount' => $amount,
            'status' => $status, 'paid_at' => now(), 'claimed_by' => $this->seller->id,
        ]);
    }

    private function handOver(string $wallClock, float $amount): Remittance
    {
        $this->at($wallClock);
        $account = PaymentAccount::create([
            'store_id' => $this->store->id, 'type' => PaymentAccount::TYPE_WALLET, 'provider' => 'telebirr',
            'account_number' => '0912000000', 'account_name' => 'Owner', 'owner_user_id' => $this->manager->id,
            'purpose' => PaymentAccount::PURPOSE_COLLECTION, 'is_active' => true,
        ]);

        return Remittance::query()->create([
            'user_id' => $this->seller->id, 'from_payment_account_id' => null, 'to_payment_account_id' => $account->id,
            'amount' => $amount, 'status' => Remittance::STATUS_CLAIMED,
        ]);
    }

    private function close(string $wallClock, ?float $till, ?string $why = null): SiteDay
    {
        $this->at($wallClock);

        return app(SiteDayService::class)->close($this->site, $this->seller, app(CounterQr::class)->printedToken($this->site), [], $till, null, null, false, $why);
    }

    #[Test]
    public function the_expected_till_is_float_plus_cash_taken_minus_cash_handed_over(): void
    {
        $day = $this->open('2026-10-19 08:30', 1000.0);
        $this->cashSale('2026-10-19 10:00', 300.0, Payment::STATUS_CONFIRMED);
        $this->cashSale('2026-10-19 11:00', 200.0); // taken, nobody confirmed it yet
        $this->handOver('2026-10-19 15:00', 400.0);

        // Cash taken the night before, and a card-less credit part, are not this day's.
        $this->at('2026-10-19 16:00');
        $cash = app(DayCash::class)->figures($this->site, $day, now());

        $this->assertSame(500.0, $cash['collected']);
        $this->assertSame(300.0, $cash['confirmed']);
        $this->assertSame(200.0, $cash['unconfirmed']);
        $this->assertSame(400.0, $cash['handed_over']);
        $this->assertSame(1100.0, $cash['expected']);
    }

    #[Test]
    public function a_till_that_does_not_match_stops_the_closing_until_it_is_explained(): void
    {
        $this->open('2026-10-19 08:30', 1000.0);
        $this->cashSale('2026-10-19 10:00', 300.0, Payment::STATUS_CONFIRMED);

        try {
            $this->close('2026-10-19 19:00', 1250.0);
            $this->fail('Short by 50 with no reason.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('short by ETB 50.00', $e->getMessage());
            $this->assertStringContainsString('counted 1,250.00, expected 1,300.00', $e->getMessage());
        }
        $this->assertSame(SiteDay::STATUS_OPEN, SiteDay::query()->sole()->status, 'Nothing was half-closed.');

        $closed = $this->close('2026-10-19 19:00', 1250.0, 'Gave change from my own pocket');

        $this->assertSame(SiteDay::STATUS_CLOSED, $closed->status);
        $this->assertSame(-50.0, (float) $closed->fresh()->till_difference);
        $this->assertSame('Gave change from my own pocket', $closed->fresh()->till_difference_note);
        $this->assertSame(1300.0, (float) $closed->fresh()->cash_expected);
    }

    #[Test]
    public function a_matching_till_closes_without_a_reason_and_cash_with_no_count_is_refused(): void
    {
        $this->open('2026-10-19 08:30', 1000.0);
        $this->cashSale('2026-10-19 10:00', 300.0, Payment::STATUS_CONFIRMED);

        try {
            $this->close('2026-10-19 19:00', null);
            $this->fail('Cash moved, so the till has to be counted.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('Count the till', $e->getMessage());
        }

        $closed = $this->close('2026-10-19 19:00', 1300.0);

        $this->assertSame(0.0, (float) $closed->fresh()->till_difference);
        $this->assertNull($closed->fresh()->till_difference_note);
    }

    #[Test]
    public function a_day_with_no_cash_at_all_closes_without_a_count(): void
    {
        $this->open('2026-10-19 08:30', null);

        $closed = $this->close('2026-10-19 19:00', null);

        $this->assertSame(SiteDay::STATUS_CLOSED, $closed->status);
        $this->assertNull($closed->fresh()->till_difference);
    }

    #[Test]
    public function a_closed_days_cash_is_frozen_and_carried_money_shows_on_the_day_it_was_taken(): void
    {
        $day = $this->open('2026-10-19 08:30', 1000.0);
        $unconfirmed = $this->cashSale('2026-10-19 10:00', 200.0);
        $this->close('2026-10-19 19:00', 1200.0);

        $frozen = $day->fresh();
        $this->assertSame(200.0, (float) $frozen->cash_collected);
        $this->assertSame(200.0, (float) $frozen->cash_unconfirmed, 'Unconfirmed at close is carried on, still shown on its own day.');

        // Next day: it gets confirmed and some cash is handed over. The closed day does not move.
        $this->at('2026-10-20 09:00');
        $unconfirmed->update(['status' => Payment::STATUS_CONFIRMED, 'confirmed_at' => now(), 'confirmed_by' => $this->manager->id]);
        $this->handOver('2026-10-20 10:00', 200.0);

        $again = $day->fresh();
        $this->assertSame(200.0, (float) $again->cash_unconfirmed);
        $this->assertSame(0.0, (float) $again->cash_handed_over);
        $this->assertSame(1200.0, (float) $again->cash_expected);

        // The payment still carries the day it was taken in.
        $tag = app(\App\Services\Workforce\DayBook::class)->tag($this->store->id, $unconfirmed->fresh()->paid_at);
        $this->assertSame('2026-10-19', $tag['key']);
        $this->assertSame('2026-10-20', LocalTime::dateOf());
    }

    #[Test]
    public function a_late_close_counts_the_cash_only_up_to_the_real_closing_time(): void
    {
        $this->open('2026-10-19 08:30', 1000.0);
        $this->cashSale('2026-10-19 10:00', 300.0, Payment::STATUS_CONFIRMED);
        $this->cashSale('2026-10-19 21:00', 999.0); // after the shop really closed at 19:00
        $this->at('2026-10-20 09:00');

        $svc = app(SiteDayService::class);

        try {
            $svc->closeLate($this->site, $this->manager, LocalTime::parse('2026-10-19T19:00'), 1250.0, 'Forgot the QR');
            $this->fail('1,300 expected, 1,250 counted, no reason for the difference.');
        } catch (WorkforceException $e) {
            $this->assertStringContainsString('expected 1,300.00', $e->getMessage());
        }

        $closed = $svc->closeLate($this->site, $this->manager, LocalTime::parse('2026-10-19T19:00'), 1250.0, 'Forgot the QR', 'Short; change given from pocket');

        $this->assertSame(300.0, (float) $closed->fresh()->cash_collected, 'The 21:00 cash is outside open hours.');
        $this->assertSame(-50.0, (float) $closed->fresh()->till_difference);
    }
}
