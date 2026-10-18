<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Exceptions\PaymentException;
use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Services\Finance\ExpenseService;
use App\Services\Tasks\TaskInbox;
use App\Services\Workforce\StaffRideService;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Expenses count once a second person (finance or a global admin) confirms; ride fuel is one of them. */
class ExpenseTest extends TestCase
{
    use RefreshDatabase;

    private ExpenseService $expenses;

    private Store $store;

    private User $finance;

    private User $driver;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();

        $this->travelTo(CarbonImmutable::parse('2026-10-19 17:00:00'));
        Storage::fake('local');
        config(['services.documents.disk' => 'local']);

        foreach (['admin', 'seller', 'store_manager', 'delivery', 'finance'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $this->expenses = app(ExpenseService::class);
        $this->store = Store::factory()->create(['name' => 'Bole Store']);
        $this->finance = $this->user('finance', null);
        $this->driver = $this->user('delivery', null, true);
        $this->manager = $this->user('store_manager', $this->store->id);
    }

    private function user(string $role, ?int $storeId, bool $driver = false): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'is_driver' => $driver]);
        $user->assignRole($role);

        return $user;
    }

    private function doneRide(): \App\Models\Workforce\StaffRide
    {
        $rides = app(StaffRideService::class);
        $site = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_STORE)->firstOrFail();
        $seller = $this->user('seller', $this->store->id);
        $ride = $rides->request($site, $this->manager, CarbonImmutable::parse('2026-10-19 19:00'), [$seller->id]);
        $rides->claim($ride, $this->driver, Vehicle::factory()->create(['status' => Vehicle::STATUS_ACTIVE]));
        $rides->depart($ride->fresh(), $this->driver);

        return $ride->fresh();
    }

    #[Test]
    public function ride_fuel_is_an_expense_finance_confirms(): void
    {
        $ride = $this->doneRide();

        $expense = $this->expenses->rideFuel($ride, $this->driver, 850, 12.5, UploadedFile::fake()->image('receipt.jpg'));

        $this->assertSame('fuel', $expense->category);
        $this->assertSame($this->store->id, $expense->store_id);
        $this->assertSame($ride->vehicle_id, $expense->vehicle_id);
        $this->assertNotNull($expense->document_id);
        $this->assertSame(Expense::STATUS_CLAIMED, $expense->status);
        $this->assertSame('claimed', app(StaffRideService::class)->present($ride->fresh(), $this->driver)['fuel']['status']);

        $this->assertNotNull(collect(app(TaskInbox::class)->for($this->finance->fresh()))->firstWhere('id', 'expenses-to-confirm'));

        $this->expenses->confirm($expense, $this->finance);
        $this->assertSame(Expense::STATUS_CONFIRMED, $expense->fresh()->status);
        $this->assertSame(['fuel' => 850.0], $this->expenses->totals('2026-10-01', '2026-10-31'));
    }

    #[Test]
    public function fuel_once_per_ride_by_its_driver_only(): void
    {
        $ride = $this->doneRide();

        try {
            $this->expenses->rideFuel($ride, $this->user('delivery', null, true), 500);
            $this->fail('Another driver recorded the fuel.');
        } catch (PaymentException $e) {
            $this->assertSame(403, $e->getCode());
        }

        $first = $this->expenses->rideFuel($ride, $this->driver, 500);

        try {
            $this->expenses->rideFuel($ride, $this->driver, 600);
            $this->fail('Fuel recorded twice.');
        } catch (PaymentException) {
        }

        // Rejected: it can be recorded again.
        $this->expenses->reject($first, $this->finance, 'Wrong amount');
        $this->assertSame(600.0, (float) $this->expenses->rideFuel($ride, $this->driver, 600)->amount);
    }

    #[Test]
    public function the_recorder_never_confirms_and_a_seller_cannot_confirm(): void
    {
        $expense = $this->expenses->record($this->finance, ['category' => 'rent', 'amount' => 30000, 'spent_on' => '2026-10-01', 'store_id' => $this->store->id]);

        try {
            $this->expenses->confirm($expense, $this->finance);
            $this->fail('The recorder confirmed their own expense.');
        } catch (PaymentException $e) {
            $this->assertSame(403, $e->getCode());
        }

        $this->expectException(PaymentException::class);
        $this->expenses->confirm($expense, $this->manager);
    }

    #[Test]
    public function the_expenses_page_on_finance_and_admin(): void
    {
        $finance = ['HTTP_HOST' => 'finance.'.config('app.system_domain')];
        $admin = ['HTTP_HOST' => 'admin.'.config('app.system_domain')];
        $global = $this->user('admin', null);

        $this->actingAs($global)->withServerVariables($admin)
            ->post(route('admin.expenses.store'), ['category' => 'utilities', 'amount' => 1200, 'spent_on' => '2026-10-18', 'description' => 'Electricity'])
            ->assertSessionHas('success');
        $expense = Expense::query()->sole();

        $this->actingAs($this->finance)->withServerVariables($finance)->get(route('finance.expenses.index'))
            ->assertInertia(fn ($page) => $page->component('Finance/Expenses/Index')->where('waiting.0.id', $expense->id)->where('waiting.0.can_decide', true));

        $this->actingAs($this->finance)->withServerVariables($finance)->post(route('finance.expenses.confirm', $expense))->assertSessionHas('success');
        $this->assertSame(Expense::STATUS_CONFIRMED, $expense->fresh()->status);
    }
}
