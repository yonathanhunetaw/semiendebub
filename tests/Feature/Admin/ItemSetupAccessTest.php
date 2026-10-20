<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\Customer;
use App\Models\Inventory\Stocktake;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Tests\Feature\Admin\Concerns\BuildsSetupItem;
use Tests\TestCase;

/**
 * Every route of the item setup page, for every kind of person: a guest is sent to sign in, anyone who is not a
 * global admin is refused, and a global admin gets past the gate (whatever the payload then says).
 */
class ItemSetupAccessTest extends TestCase
{
    use BuildsSetupItem;
    use RefreshDatabase;

    private Stocktake $take;

    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->setUpSetupItem();
        $this->deployed();
        $this->take = Stocktake::query()->create(['reference' => 'ST-ACCESS', 'stock_location_id' => $this->floor()->id, 'status' => Stocktake::SUBMITTED, 'started_by' => $this->admin->id]);
        $this->customer = Customer::factory()->create(['store_id' => $this->store->id]);
    }

    /** @return array<string, array{0: string, 1: string, 2: list<string>}> */
    public static function routes(): array
    {
        return [
            'the setup page' => ['GET', 'admin.items.setup', ['item']],
            'the new item page' => ['GET', 'admin.items.create', []],
            'the old edit address' => ['GET', 'admin.items.edit', ['item']],
            'create an item' => ['POST', 'admin.items.setup.store', []],
            'save basics' => ['PUT', 'admin.items.setup.basics', ['item']],
            'add a picture' => ['POST', 'admin.items.setup.pictures.store', ['item']],
            'remove a picture' => ['DELETE', 'admin.items.setup.pictures.destroy', ['item']],
            'preview options' => ['POST', 'admin.items.setup.options.preview', ['item']],
            'save options' => ['PUT', 'admin.items.setup.options', ['item']],
            'save barcodes' => ['PUT', 'admin.items.setup.barcodes', ['item']],
            'generate a barcode' => ['POST', 'admin.items.setup.barcode.generate', ['item', 'variant']],
            'upload a variant picture' => ['POST', 'admin.items.setup.image', ['item', 'variant', 'slot']],
            'remove a variant picture' => ['DELETE', 'admin.items.setup.image.destroy', ['item', 'variant', 'slot']],
            'deploy' => ['POST', 'admin.items.deploy', ['item']],
            'save prices' => ['PUT', 'admin.items.setup.prices', ['item', 'store']],
            'save a seller price' => ['PUT', 'admin.items.setup.seller-prices', ['item', 'store']],
            'remove a seller price' => ['DELETE', 'admin.items.setup.seller-prices.destroy', ['item', 'store', 'seller']],
            'save a customer price' => ['PUT', 'admin.items.setup.customer-prices', ['item', 'store']],
            'remove a customer price' => ['DELETE', 'admin.items.setup.customer-prices.destroy', ['item', 'store', 'customer']],
            'search customers' => ['GET', 'admin.items.setup.customers', ['store']],
            'save a shelf bin' => ['PUT', 'admin.items.setup.bin', ['item', 'location']],
            'remove a shelf bin' => ['DELETE', 'admin.items.setup.bin.destroy', ['item', 'location']],
            'save the refill route' => ['PUT', 'admin.items.setup.route', ['item', 'store']],
            'save a count' => ['POST', 'admin.items.setup.count', ['item', 'location']],
            'approve a count' => ['POST', 'admin.items.setup.count.approve', ['item', 'stocktake']],
            'void a count' => ['POST', 'admin.items.setup.count.void', ['item', 'stocktake']],
            'delete the item' => ['DELETE', 'admin.items.destroy', ['item']],
        ];
    }

    /** @return array<string, array{0: string, 1: string, 2: list<string>, 3: string}> every route × every kind of person who must be refused */
    public static function refused(): array
    {
        $out = [];
        foreach (self::routes() as $name => [$method, $route, $params]) {
            foreach (['seller', 'stock_keeper', 'delivery', 'store_manager', 'finance', 'procurement', 'marketing', 'vendor', 'store admin'] as $who) {
                $out["{$name} / {$who}"] = [$method, $route, $params, $who];
            }
        }

        return $out;
    }

    /** @param list<string> $names @return array<string, mixed> */
    private function params(array $names): array
    {
        $all = [
            'item' => $this->item, 'store' => $this->store, 'location' => $this->shelf(), 'variant' => $this->variant,
            'stocktake' => $this->take, 'customer' => $this->customer, 'seller' => $this->makeUser('seller', $this->store->id), 'slot' => 0,
        ];

        return array_map(fn (string $n) => $all[$n], $names);
    }

    private function send(string $method, string $route, array $names): \Illuminate\Testing\TestResponse
    {
        $url = route($route, $this->params($names));

        return $this->call($method, $url, [], [], [], ['HTTP_ACCEPT' => 'text/html', 'HTTP_HOST' => 'admin.'.config('app.system_domain')]);
    }

    #[Test]
    #[DataProvider('routes')]
    public function a_guest_is_sent_to_sign_in(string $method, string $route, array $names): void
    {
        $this->send($method, $route, $names)->assertRedirect();
        $this->assertGuest();
    }

    #[Test]
    #[DataProvider('refused')]
    public function everyone_but_a_global_admin_is_refused(string $method, string $route, array $names, string $who): void
    {
        $user = $who === 'store admin' ? $this->makeUser('admin', $this->store->id) : $this->makeUser($who, $this->store->id);

        $this->actingAs($user);
        $this->send($method, $route, $names)->assertForbidden();
    }

    #[Test]
    #[DataProvider('routes')]
    public function a_global_admin_gets_past_the_gate(string $method, string $route, array $names): void
    {
        $this->actingAs($this->admin);

        $status = $this->send($method, $route, $names)->getStatusCode();

        $this->assertNotContains($status, [401, 403, 404, 500], "{$method} {$route} answered {$status}");
    }

    #[Test]
    public function nothing_was_changed_by_the_refused_attempts(): void
    {
        $this->actingAs($this->makeUser('seller', $this->store->id));
        $before = [$this->item->fresh()->toArray(), $this->variant->fresh()->toArray()];

        foreach (self::routes() as [$method, $route, $names]) {
            if ($route !== 'admin.items.destroy') {
                $this->send($method, $route, $names);
            }
        }
        $this->send('DELETE', 'admin.items.destroy', ['item']);

        $this->assertSame($before, [$this->item->fresh()->toArray(), $this->variant->fresh()->toArray()]);
        $this->assertSame(Stocktake::SUBMITTED, $this->take->fresh()->status);
    }
}
