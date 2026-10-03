<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Fulfillment\Delivery;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\Fulfillment\OrderSourcingService;
use App\Services\Inventory\StockLocationTree;
use App\Services\ShipmentWorkflowService;
use App\Services\StockService;
use App\Services\TransferWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Routing\Route;
use Illuminate\Support\Facades\Route as Router;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Every page of the Stock Keeper, Delivery and Admin apps opens without an
 * error, over a world that has something in every state: stock on shelves,
 * floors, a Remote Hub and both Main Hubs, goods In Delivery, an order at each
 * stage, a transfer, a shipment and a delivery run.
 *
 * Pages that take a parameter are opened for a real record of that kind. A
 * page this test cannot fill is listed as skipped rather than silently passed.
 */
class RolePagesSmokeTest extends TestCase
{
    use RefreshDatabase;

    /** @var array<string, int|string> route parameter => value */
    private array $params = [];

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    public static function roles(): array
    {
        return [
            'stock keeper' => ['stock_keeper', 'stockkeeper', 'stock_keeper.'],
            'delivery' => ['delivery', 'delivery', 'delivery.'],
            'admin' => ['admin', 'admin', 'admin.'],
        ];
    }

    #[Test]
    #[DataProvider('roles')]
    public function every_page_of_the_role_opens(string $role, string $subdomain, string $prefix): void
    {
        $this->world();
        $user = $this->user($role);

        $failures = [];
        $skipped = [];
        $opened = 0;

        /** @var Route $route */
        foreach (Router::getRoutes() as $route) {
            $name = (string) $route->getName();

            if (! str_starts_with($name, $prefix) || ! in_array('GET', $route->methods(), true)) {
                continue;
            }

            // Guest-only screens and the canvas (an external editor) are out of scope.
            if (in_array($name, ["{$prefix}login", "{$prefix}welcome"], true) || str_contains($name, 'canvas')) {
                continue;
            }

            $args = [];

            foreach ($route->parameterNames() as $parameter) {
                if (! array_key_exists($parameter, $this->params)) {
                    $skipped[] = "{$name} ({$parameter})";
                    continue 2;
                }

                $args[$parameter] = $this->params[$parameter];
            }

            $this->withServerVariables(['HTTP_HOST' => $subdomain.'.'.config('app.system_domain')]);
            $response = $this->actingAs($user, 'web')->get(route($name, $args));
            $opened++;

            $status = $response->getStatusCode();

            if ($status >= 500 || ($status >= 400 && $status !== 403 && $status !== 404)) {
                $exception = $response->exception?->getMessage() ?? '';
                $failures[] = "{$name} → {$status} ".mb_substr($exception, 0, 300);
            }
        }

        fwrite(STDERR, sprintf("\n[%s] opened %d pages; skipped: %s\n", $role, $opened, $skipped === [] ? 'none' : implode(', ', $skipped)));

        $this->assertSame([], $failures, implode("\n", $failures));
        $this->assertGreaterThan(3, $opened);
    }

    /** Something in every state, and the ids the pages are opened with. */
    private function world(): void
    {
        foreach (['admin', 'seller', 'stock_keeper', 'delivery', 'store_manager'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $stock = app(StockService::class);
        $store = Store::factory()->create(['name' => 'Main Store', 'type' => Store::TYPE_RETAIL, 'status' => 'active', 'location' => 'Merkato']);
        $remote = app(StockLocationTree::class)->addRemoteHub($store);
        $warehouseA = Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01', 'address' => 'Kality']);
        Warehouse::create(['name' => 'Main Distribution Hub B', 'code' => 'WH-NORTH-02', 'address' => 'Piassa']);
        $hubA = StockLocation::query()->legacy(Warehouse::class, $warehouseA->id)->sole();
        $shelf = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_SHELF)->sole();
        $floor = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();

        $item = Item::factory()->create(['status' => 'active', 'product_name' => 'Gel Pen 0.7']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $storeVariant = StoreVariant::factory()->create([
            'store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id,
            'pricing_matrix' => ['price' => 200.0], 'active' => true,
        ]);

        foreach ([[$shelf, 20], [$floor, 60], [$remote, 40], [$hubA, 300]] as [$leaf, $qty]) {
            $stock->receive($variant->id, $leaf, $qty);
        }

        $seller = $this->user('seller', $store->id);
        $courier = $this->user('delivery');
        $customer = Customer::create(['name' => 'Abebe Tadesse', 'phone' => '0911223344', 'email' => 'abebe@example.com', 'store_id' => $store->id]);

        // Orders at every stage: to pay, paid, picked & with a courier, delivered.
        $cart = fn (int $qty): Cart => tap(Cart::create(['store_id' => $store->id, 'seller_id' => $seller->id, 'user_id' => $seller->id, 'customer_id' => $customer->id, 'status' => 'open']),
            fn (Cart $c) => $c->variants()->attach($variant->id, ['quantity' => $qty, 'price' => 200, 'store_id' => $store->id]));

        $checkout = app(CheckoutService::class);
        $checkout->checkout($cart(1), [], $seller->id, ['delivery_address' => 'Bole']);
        $checkout->checkout($cart(1), ['payment_method' => 'cash'], $seller->id);
        $picked = $checkout->checkout($cart(2), ['payment_method' => 'cash'], $seller->id, ['delivery_address' => 'Piassa']);
        app(OrderSourcingService::class)->confirmSourcing($picked->fresh(), $picked->items->map(fn ($i) => [
            'sale_item_id' => $i->id, 'location_type' => StockLocation::class, 'location_id' => $shelf->id,
        ])->all(), $seller);
        $delivery = Delivery::query()->where('sale_id', $picked->id)->sole();
        app(\App\Services\DeliveryService::class)->claim($delivery, $courier);
        $cart(3); // an open cart

        // A transfer with a courier, in transit.
        $workflow = app(TransferWorkflowService::class);
        $transfer = $workflow->create(variantId: $variant->id, fromStoreId: null, toStoreId: null, quantity: 5,
            sourceLocationType: StockLocation::class, sourceLocationId: $remote->id,
            destinationLocationType: StockLocation::class, destinationLocationId: $floor->id, courierId: $courier->id);
        $workflow->markDispatched($transfer);

        // A shipment from Hub A, dispatched.
        $shipments = app(ShipmentWorkflowService::class);
        $shipment = $shipments->createBetween($hubA, $floor, ['scheduled_for' => now()->addDay()->format('Y-m-d\TH:i')], $seller->id);
        $shipments->addItem($shipment, $variant, 10);
        $shipment->update(['status' => ShipmentWorkflowService::READY, 'courier_id' => $courier->id]);
        $shipments->transition($shipment->fresh(), ShipmentWorkflowService::DISPATCHED);

        $this->params = [
            'shipment' => $shipment->id,
            'transfer' => $transfer->id,
            'delivery' => $delivery->id,
            'stock' => (int) ItemStock::query()->where('stock_location_id', $floor->id)->value('id'),
            'item' => $item->id,
            'store' => $store->id,
            'warehouse' => $warehouseA->id,
            'location' => $warehouseA->id,
            'stockLocation' => $hubA->id,
            'storeVariant' => $storeVariant->id,
            'customer' => $customer->id,
            'cart' => Cart::query()->where('status', 'open')->value('id'),
            'id' => Cart::query()->where('status', 'open')->value('id'),
            'user' => $seller->id,
            'reference' => $picked->reference_number,
        ];
    }

    private function user(string $role, ?int $storeId = null): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId]);
        $user->assignRole($role);

        return $user->refresh();
    }
}
