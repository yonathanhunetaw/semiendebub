<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\CheckoutService;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The stock keeper's pick queue is real orders: paid sales waiting for Pick &
 * Pack, with each line's sources and the nearest that covers it preselected.
 */
class PickQueueTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private StockLocation $shelf;

    private User $keeper;

    private Sale $sale;

    protected function setUp(): void
    {
        parent::setUp();

        Role::firstOrCreate(['name' => 'stock_keeper']);
        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $this->shelf = StockLocation::query()->where('store_id', $this->store->id)->where('kind', StockLocation::KIND_SHELF)->sole();

        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        StoreVariant::factory()->create(['store_id' => $this->store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'active' => true]);
        app(StockService::class)->receive($variant->id, $this->shelf, 9);

        $cart = Cart::create(['store_id' => $this->store->id, 'status' => 'open']);
        $cart->variants()->attach($variant->id, ['quantity' => 4, 'price' => 100, 'store_id' => $this->store->id]);
        $this->sale = app(CheckoutService::class)->checkout($cart, ['payment_method' => 'cash']);

        $this->keeper = User::factory()->create(['role' => 'stock_keeper', 'store_id' => $this->store->id]);
        $this->keeper->assignRole('stock_keeper');
    }

    #[Test]
    public function a_keeper_picks_a_paid_order_and_hands_it_to_delivery(): void
    {
        $this->asKeeper($this->keeper)
            ->get(route('stock_keeper.orders.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->where('counts.to_pick', 1)
                ->where('orders.0.sale.reference', $this->sale->reference_number)
                // The shelf holds enough, so it is the suggestion.
                ->where('orders.0.lines.0', function ($line): bool {
                    $shelf = collect($line['options'])->firstWhere('kind', 'shelf');

                    return $shelf !== null && $shelf['sufficient']
                        && $line['suggested_source']['location_type'] === $shelf['location_type']
                        && $line['suggested_source']['location_id'] === $shelf['location_id'];
                }));

        $this->asKeeper($this->keeper)
            ->post(route('stock_keeper.orders.pick', $this->sale), [
                'lines' => $this->sale->items->map(fn ($item) => [
                    'sale_item_id' => $item->id,
                    'location_type' => StockLocation::class,
                    'location_id' => $this->shelf->id,
                ])->all(),
            ])
            ->assertSessionHas('success');

        $this->assertSame(Sale::STAGE_TO_DELIVER, $this->sale->fresh()->fulfillment_stage);

        $this->asKeeper($this->keeper)
            ->get(route('stock_keeper.orders.index', ['tab' => 'with_delivery']))
            ->assertInertia(fn ($page) => $page->where('counts', ['to_pick' => 0, 'with_delivery' => 1]));
    }

    #[Test]
    public function goods_in_delivery_are_not_on_the_keepers_ledger_or_recountable(): void
    {
        $this->asKeeper($this->keeper)->post(route('stock_keeper.orders.pick', $this->sale), [
            'lines' => $this->sale->items->map(fn ($item) => [
                'sale_item_id' => $item->id, 'location_type' => StockLocation::class, 'location_id' => $this->shelf->id,
            ])->all(),
        ]);

        $custody = \App\Models\StockKeeper\ItemStock::query()
            ->whereIn('stock_location_id', StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->select('id'))
            ->sole();

        $this->asKeeper($this->keeper)
            ->get(route('stock_keeper.inventory.index'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->where('stock', fn ($rows) => ! collect($rows)->contains('id', $custody->id)));

        $this->asKeeper($this->keeper)
            ->patch(route('stock_keeper.inventory.adjust', $custody), ['counted_quantity' => 0])
            ->assertSessionHas('error');

        $this->assertSame(4, (int) $custody->fresh()->quantity);
    }

    #[Test]
    public function a_keeper_at_another_store_neither_sees_nor_picks_it(): void
    {
        $other = User::factory()->create(['role' => 'stock_keeper', 'store_id' => Store::factory()->create()->id]);
        $other->assignRole('stock_keeper');

        $this->asKeeper($other)
            ->get(route('stock_keeper.orders.index'))
            ->assertInertia(fn ($page) => $page->where('counts.to_pick', 0));

        $this->asKeeper($other)
            ->post(route('stock_keeper.orders.pick', $this->sale), [
                'lines' => [['sale_item_id' => $this->sale->items[0]->id, 'location_type' => StockLocation::class, 'location_id' => $this->shelf->id]],
            ])
            ->assertNotFound();
    }

    private function asKeeper(User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
