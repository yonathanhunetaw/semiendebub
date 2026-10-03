<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use App\Services\Inventory\StockLocationTree;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Admin → Inventory → Transfers: raise one, give it a courier, hand it over,
 * receive it — and read its custody journal.
 */
class AdminTransferFlowTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function an_admin_raises_a_remote_hub_transfer_and_sees_it_through(): void
    {
        foreach (['admin', 'delivery'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $courier = User::factory()->create(['role' => 'delivery', 'first_name' => 'Chala']);
        $courier->assignRole('delivery');

        $store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $remote = app(StockLocationTree::class)->addRemoteHub($store);
        $floor = StockLocation::query()->where('store_id', $store->id)->where('kind', StockLocation::KIND_BACKROOM)->sole();
        $variant = ItemVariant::factory()->create();
        app(StockService::class)->receive($variant->id, $remote, 20);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($admin);

        $this->get(route('admin.inventory.transfers.create'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/Inventory/Transfers/Create')->where('couriers.0.name', 'Chala '.$courier->last_name));

        $this->post(route('admin.inventory.transfers.store'), [
            'item_variant_id' => $variant->id,
            'quantity' => 8,
            'source_location_type' => StockLocation::class,
            'source_location_id' => $remote->id,
            'destination_location_type' => StockLocation::class,
            'destination_location_id' => $floor->id,
        ])->assertSessionHasNoErrors();

        $transfer = Transfer::query()->sole();

        // No courier yet: the hand-off is refused.
        $this->patch(route('admin.inventory.transfers.dispatch', $transfer))->assertSessionHas('error');

        $this->patch(route('admin.inventory.transfers.courier', $transfer), ['courier_id' => $courier->id])->assertSessionHas('success');
        $this->patch(route('admin.inventory.transfers.dispatch', $transfer))->assertSessionHas('success');
        $this->patch(route('admin.inventory.transfers.complete', $transfer))->assertSessionHas('success');

        $this->assertSame(8, (int) ItemStock::query()->where('stock_location_id', $floor->id)->value('quantity'));

        $this->get(route('admin.inventory.transfers.show', $transfer))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Admin/Inventory/Transfers/Show')
                ->where('transfer.status', 'completed')
                ->where('journal', fn ($rows) => collect($rows)->pluck('type')->all() === ['move_out', 'custody_in', 'custody_out', 'move_in']));
    }
}
