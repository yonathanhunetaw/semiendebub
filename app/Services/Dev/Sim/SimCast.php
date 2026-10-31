<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\PaymentAccount;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\LocationStaff;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\PriceProvider;
use App\Services\StockService;
use Illuminate\Support\Facades\Hash;
use RuntimeException;
use Spatie\Permission\Models\Role;

/**
 * The people, accounts, customers and goods of the simulated shop (sim:week).
 *
 * Everyone is a sim.*@duka.test login with one shared password, named by the
 * job they do (Abebe Manager, Hana Seller, Bereket Driver…), so whoever logs
 * in as them knows what they are looking at. Created with updateOrCreate, so a
 * second run reuses them.
 *
 * Customers follow the app's rule: a Business has no TIN; a customer with a
 * TIN is an Individual (priced with VAT).
 */
final class SimCast
{
    public const PASSWORD = 'sim-password';

    /** key => [role, first name, last name (the job), at the store?, driver?] */
    private const PEOPLE = [
        'manager' => ['store_manager', 'Abebe', 'Manager', true, false],
        'seller1' => ['seller', 'Hana', 'Seller', true, false],
        'seller2' => ['seller', 'Dawit', 'Seller', true, false],
        'seller3' => ['seller', 'Selam', 'Seller', true, false],
        'seller4' => ['seller', 'Meseret', 'Seller', true, false],
        'keeper' => ['stock_keeper', 'Meron', 'Store Keeper', true, false],
        'hubkeeper' => ['stock_keeper', 'Yared', 'Hub Keeper', false, false],
        'driver1' => ['delivery', 'Bereket', 'Driver', true, true],
        'driver2' => ['delivery', 'Kidus', 'Driver', true, true],
        'finance' => ['finance', 'Tigist', 'Finance', true, false],
        'admin' => ['admin', 'Sara', 'Admin', false, false],
    ];

    /** Business accounts (no TIN). The first five buy on credit. */
    private const BUSINESSES = [
        'Bole Café', 'Piassa Mini Market', 'Kazanchis Hotel', 'Megenagna Bakery', 'Sarbet Pharmacy',
        'Arat Kilo Stationery', 'CMC Supermarket', 'Gerji Restaurant', 'Lideta Clinic', 'Merkato Traders',
        'Ayat Guest House', 'Summit School', 'Bambis Kiosk', 'Hayahulet Salon', 'Mexico Juice House',
        'Gotera Office Supply', 'Lebu Construction', 'Jemo Butchery', 'Kality Garage', 'Saris Cafeteria',
        'Wello Sefer Shop', 'Tor Hailoch Bar', 'Asko Grocery', 'Kotebe College', 'Shola Wholesale',
    ];

    /** Individuals (with a TIN): the walk-ins. */
    private const INDIVIDUALS = ['Almaz', 'Kebede', 'Tsion', 'Yonas', 'Mahlet', 'Henok', 'Rahel', 'Samuel'];

    /** @var array<string, User> */
    public array $people = [];

    /** @var array<int, Customer> */
    public array $businesses = [];

    /** @var array<int, Customer> the five with credit; the last goes overdue */
    public array $credit = [];

    /** @var array<int, Customer> */
    public array $individuals = [];

    public Store $store;

    public StockLocation $site;

    public StockLocation $shelf;

    public StockLocation $floor;

    public StockLocation $hub;

    public ?StockLocation $remoteHub = null;

    public Vehicle $van;

    public PaymentAccount $bank;

    public PaymentAccount $wallet;

    public PaymentAccount $settlement;

    /** @var array<int, array{store_variant_id: int, item_variant_id: int, price: float, name: string}> */
    public array $goods = [];

    /** @var array<int, int> item variant ids the morning shipment brings */
    public array $hubGoods = [];

    public function __construct(private readonly StockService $stock)
    {
    }

    /**
     * Why the simulator may not run here, or null when it may: only on a
     * *_sim database outside production (or the PHP tests' own database).
     */
    public static function refusal(): ?string
    {
        return self::refusalFor(
            (string) config('database.connections.'.config('database.default').'.database'),
            app()->environment('production'),
            app()->runningUnitTests(),
        );
    }

    public static function refusalFor(string $database, bool $production, bool $tests): ?string
    {
        if ($production) {
            return 'Refusing to simulate in production.';
        }

        return str_ends_with($database, '_sim') || $tests
            ? null
            : "Refusing to run against '{$database}': only a *_sim database (make sim copies dev into one).";
    }

    /** Set everything up (idempotent). */
    public function build(int $goods = 80): self
    {
        $this->places();

        foreach (self::PEOPLE as $key => [$role, $first, $last, $atStore, $driver]) {
            $this->people[$key] = $this->user($key, $role, $first, $last, $atStore ? $this->store : null, $driver);
        }

        // The store keeper staffs the store's dock (shipments land on its floor).
        LocationStaff::query()->firstOrCreate(['stock_location_id' => $this->site->id, 'user_id' => $this->people['keeper']->id]);

        $this->accounts();
        $this->customers();
        $this->pickGoods($goods);
        $this->stockHub();

        return $this;
    }

    /** Load what build() made, without changing anything (sim:check, sim:live). */
    public function load(): self
    {
        $this->places();

        foreach (array_keys(self::PEOPLE) as $key) {
            $this->people[$key] = User::query()->where('email', "sim.{$key}@duka.test")->firstOrFail();
        }

        $this->bank = PaymentAccount::query()->where('account_number', 'SIM-BANK-01')->firstOrFail();
        $this->wallet = PaymentAccount::query()->where('account_number', 'SIM-WALLET-01')->firstOrFail();
        $this->settlement = PaymentAccount::query()->where('account_number', 'SIM-SET-01')->firstOrFail();
        $this->customers();
        $this->pickGoods(80);

        return $this;
    }

    public function person(string $key): User
    {
        return $this->people[$key] ?? throw new RuntimeException("No sim person [{$key}].");
    }

    /** @return array<int, array{0: string, 1: string, 2: string}> name, app, email */
    public function roster(): array
    {
        $apps = ['store_manager' => 'seller', 'seller' => 'seller', 'stock_keeper' => 'stockkeeper', 'delivery' => 'delivery', 'finance' => 'finance', 'admin' => 'admin'];

        return array_map(fn (string $key): array => [
            trim($this->people[$key]->first_name.' '.$this->people[$key]->last_name),
            $apps[self::PEOPLE[$key][0]],
            (string) $this->people[$key]->email,
        ], array_keys(self::PEOPLE));
    }

    private function places(): void
    {
        $this->store = Store::query()->where('name', 'Main Store')->first() ?? Store::query()->orderBy('id')->firstOrFail();
        $at = fn (string $kind): ?StockLocation => StockLocation::query()->where('store_id', $this->store->id)->where('kind', $kind)->orderBy('id')->first();

        $this->site = $at(StockLocation::KIND_STORE) ?? throw new RuntimeException("{$this->store->name} has no store location.");
        $this->shelf = $at(StockLocation::KIND_SHELF) ?? throw new RuntimeException("{$this->store->name} has no shelf.");
        $this->floor = $at(StockLocation::KIND_BACKROOM) ?? throw new RuntimeException("{$this->store->name} has no floor.");
        $this->remoteHub = $at(StockLocation::KIND_REMOTE_HUB);
        $this->hub = StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->orderBy('id')->firstOrFail();
        $this->van = Vehicle::query()->where('status', 'active')->orderBy('id')->first()
            ?? Vehicle::query()->create(['name' => 'Sim Van', 'plate' => 'SIM-0001', 'status' => 'active', 'max_cbm' => 6]);
    }

    private function user(string $key, string $role, string $first, string $last, ?Store $store, bool $driver): User
    {
        $user = User::query()->updateOrCreate(
            ['email' => "sim.{$key}@duka.test"],
            [
                'first_name' => $first,
                'last_name' => $last,
                'phone_number' => '09880000'.str_pad((string) (array_search($key, array_keys(self::PEOPLE), true) + 1), 2, '0', STR_PAD_LEFT),
                'role' => $role,
                'store_id' => $store?->id,
                'is_driver' => $driver,
                'password' => Hash::make(self::PASSWORD),
                'email_verified_at' => now(),
            ],
        );

        Role::findOrCreate($role, 'web');
        $user->syncRoles([$role]);

        return $user;
    }

    private function accounts(): void
    {
        $account = fn (string $number, string $type, string $provider, string $name, User $owner, string $purpose): PaymentAccount => PaymentAccount::query()->updateOrCreate(
            ['account_number' => $number],
            ['store_id' => $this->store->id, 'type' => $type, 'provider' => $provider, 'account_name' => $name,
                'owner_user_id' => $owner->id, 'purpose' => $purpose, 'is_active' => true],
        );

        // Bank transfers land in the manager's account; mobile money in finance's wallet.
        $this->bank = $account('SIM-BANK-01', PaymentAccount::TYPE_BANK, 'cbe', 'Sim CBE (Abebe)', $this->person('manager'), PaymentAccount::PURPOSE_COLLECTION);
        $this->wallet = $account('SIM-WALLET-01', PaymentAccount::TYPE_WALLET, 'telebirr', 'Sim telebirr (Tigist)', $this->person('finance'), PaymentAccount::PURPOSE_COLLECTION);
        // Sellers hand the day's cash over into the manager's settlement account.
        $this->settlement = $account('SIM-SET-01', PaymentAccount::TYPE_BANK, 'cbe', 'Sim Settlement (Abebe)', $this->person('manager'), PaymentAccount::PURPOSE_SETTLEMENT);
        $this->settlement->remitters()->syncWithoutDetaching([
            $this->person('seller1')->id, $this->person('seller2')->id, $this->person('seller3')->id, $this->person('seller4')->id,
        ]);
    }

    private function customers(): void
    {
        $this->businesses = [];
        $this->credit = [];
        $this->individuals = [];

        foreach (self::BUSINESSES as $i => $name) {
            $hasCredit = $i < 5;
            $customer = Customer::query()->updateOrCreate(
                ['email' => 'sim.business.'.($i + 1).'@duka.test'],
                [
                    'first_name' => $name,
                    'last_name' => $hasCredit ? '(credit)' : '(business)',
                    'phone_number' => '09770'.str_pad((string) ($i + 1), 5, '0', STR_PAD_LEFT),
                    'city' => 'Addis Ababa',
                    'store_id' => $this->store->id,
                    'tin_number' => null,
                    // The fifth has three days to pay and never does: it goes overdue mid-week.
                    'credit_limit' => $hasCredit ? ($i === 4 ? 15000 : 40000) : null,
                    'credit_days' => $hasCredit ? ($i === 4 ? 3 : 14) : null,
                ],
            );
            $this->businesses[] = $customer;
            if ($hasCredit) {
                $this->credit[] = $customer;
            }
        }

        foreach (self::INDIVIDUALS as $i => $name) {
            $this->individuals[] = Customer::query()->updateOrCreate(
                ['email' => 'sim.walkin.'.($i + 1).'@duka.test'],
                [
                    'first_name' => $name,
                    'last_name' => '(walk-in)',
                    'phone_number' => '09660'.str_pad((string) ($i + 1), 5, '0', STR_PAD_LEFT),
                    'city' => 'Addis Ababa',
                    'store_id' => $this->store->id,
                    'tin_number' => 'SIM'.str_pad((string) ($i + 1), 7, '0', STR_PAD_LEFT),
                ],
            );
        }
    }

    /**
     * Priced, active store items with plenty on the store's floor or shelf:
     * what the sellers sell. Same order every run, so a seed gives the same week.
     */
    private function pickGoods(int $wanted): void
    {
        $held = ItemStock::query()
            ->whereIn('stock_location_id', [$this->floor->id, $this->shelf->id])
            ->groupBy('item_variant_id')
            ->havingRaw('SUM(quantity) >= 40')
            ->selectRaw('item_variant_id')
            ->pluck('item_variant_id');

        $this->goods = [];

        StoreVariant::query()
            ->where('store_id', $this->store->id)
            ->where('active', true)
            ->whereIn('item_variant_id', $held)
            ->with('itemVariant.item')
            ->orderBy('id')
            ->get()
            ->each(function (StoreVariant $storeVariant) use ($wanted): bool {
                $ladder = PriceProvider::getPriceLadder((int) $storeVariant->id, (int) $this->store->id);
                $price = (float) ($ladder[0]['price'] ?? 0);

                // Everyday goods (20–1,500 birr), so a day is a few hundred receipts, not a handful of big ones.
                if ($price >= 20 && $price <= 1500 && $storeVariant->itemVariant !== null) {
                    $this->goods[] = [
                        'store_variant_id' => (int) $storeVariant->id,
                        'item_variant_id' => (int) $storeVariant->item_variant_id,
                        'price' => $price,
                        'name' => (string) ($storeVariant->itemVariant->item?->product_name ?? $storeVariant->itemVariant->sku),
                    ];
                }

                return count($this->goods) < $wanted;
            });

        if (count($this->goods) < 10) {
            throw new RuntimeException('Fewer than 10 priced items with stock on the store floor or shelf: nothing to simulate selling.');
        }

        $this->hubGoods = array_slice(array_column($this->goods, 'item_variant_id'), 0, 12);
    }

    /** The hub holds enough of the refill goods for a week of morning shipments. */
    private function stockHub(): void
    {
        foreach ($this->hubGoods as $variantId) {
            $have = (int) ItemStock::query()->where('stock_location_id', $this->hub->id)->where('item_variant_id', $variantId)->sum('quantity');

            if ($have < 300) {
                $this->stock->receive($variantId, $this->hub, 300 - $have, [
                    'reason' => 'Sim: opening stock at the hub',
                    'user_id' => $this->person('hubkeeper')->id,
                ]);
            }
        }
    }
}
