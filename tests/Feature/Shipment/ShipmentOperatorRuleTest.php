<?php

declare(strict_types=1);

namespace Tests\Feature\Shipment;

use App\Exceptions\MovementDomainException;
use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService as Workflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Once a place has managers, only they (or an admin) take a shipment's goods
 * into it; a keeper of the receiving store who is not one of them is refused.
 */
class ShipmentOperatorRuleTest extends TestCase
{
    use RefreshDatabase;

    private Workflow $workflow;

    private Store $depot;

    private Shipment $shipment;

    protected function setUp(): void
    {
        parent::setUp();

        $this->workflow = app(Workflow::class);
        $hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->depot = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id]);

        $this->shipment = $this->workflow->create($hub->id, $this->depot->id, ['scheduled_for' => '2026-11-02T08:30']);
        $this->workflow->addItem($this->shipment->fresh(), $variant, 4);
        $this->shipment->forceFill(['status' => Workflow::DELIVERED])->save();
        $this->shipment->refresh();
    }

    private function keeper(?int $storeId): User
    {
        $user = User::factory()->create(['role' => 'stock_keeper', 'store_id' => $storeId]);
        $user->assignRole('stock_keeper');

        return $user->refresh();
    }

    #[Test]
    public function a_keeper_who_is_not_a_manager_of_a_managed_destination_cannot_take_the_goods_in(): void
    {
        $leaf = $this->workflow->destinationLeaf($this->shipment);
        $manager = $this->keeper($this->depot->id);
        $leaf->syncManagers([$manager->id]);

        $this->actingAs($this->keeper($this->depot->id));

        try {
            $this->workflow->transition($this->shipment, Workflow::RECEIVED);
            $this->fail('expected the receipt to be refused');
        } catch (MovementDomainException|\RuntimeException|\Illuminate\Auth\Access\AuthorizationException $e) {
            // The party check answers first; the location-manager check behind it is a second wall.
            $this->assertContains($e->getMessage(), ['Only the receiving dock confirms receipt.', "Only {$leaf->name}'s managers can take stock into it."]);
        }

        $this->assertSame(Workflow::DELIVERED, $this->shipment->fresh()->status);
        $this->assertInstanceOf(StockLocation::class, $leaf);
    }
}
