<?php

declare(strict_types=1);

namespace Tests\Feature\StockKeeper;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService as Workflow;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * POST /shipments/{shipment}/receipt on the stock keeper app: the receiver
 * counts what arrived (and what is damaged) before signing a delivered run in.
 */
class ShipmentReceiptCountTest extends TestCase
{
    use RefreshDatabase;

    private Store $hub;

    private Store $depot;

    private User $keeper;

    private ItemVariant $a;

    private ItemVariant $b;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hub = Store::factory()->create(['name' => 'Warehouse A', 'type' => Store::TYPE_CENTRAL_WAREHOUSE]);
        $this->depot = Store::factory()->create(['name' => 'Kality Depot', 'type' => Store::TYPE_REMOTE_WAREHOUSE]);
        $this->keeper = $this->user('stock_keeper', $this->depot->id);

        $item = Item::factory()->create(['status' => 'active']);
        $this->a = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->b = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->withServerVariables(['HTTP_HOST' => 'stockkeeper.'.config('app.system_domain')]);
    }

    private function user(string $role, ?int $storeId): User
    {
        $user = User::factory()->create(['role' => $role, 'store_id' => $storeId, 'email_verified_at' => now()]);
        $user->assignRole($role);

        return $user->refresh();
    }

    private function shipment(string $status = Workflow::DELIVERED): Shipment
    {
        $workflow = app(Workflow::class);
        $shipment = $workflow->create($this->hub->id, $this->depot->id, ['scheduled_for' => '2026-11-02T08:30']);
        $workflow->addItem($shipment->fresh(), $this->a, 10);
        $workflow->addItem($shipment->fresh(), $this->b, 5);
        $shipment->forceFill(['status' => $status])->save();

        return $shipment->fresh();
    }

    private function receipt(Shipment $shipment, array $lines)
    {
        return $this->actingAs($this->keeper)
            ->from(route('stock_keeper.shipments.show', $shipment))
            ->post(route('stock_keeper.shipments.receipt', $shipment), ['lines' => $lines]);
    }

    #[Test]
    public function the_receiver_records_what_arrived_line_by_line(): void
    {
        $shipment = $this->shipment();

        $this->receipt($shipment, [
            ['item_variant_id' => $this->a->id, 'received' => 9, 'damaged' => 2, 'note' => 'one carton crushed'],
        ])->assertRedirect()->assertSessionHas('success');

        $lines = $shipment->items()->get()->keyBy('item_variant_id');
        $this->assertSame(9, (int) $lines[$this->a->id]->received_quantity);
        $this->assertSame(2, (int) $lines[$this->a->id]->damaged_quantity);
        $this->assertSame('one carton crushed', $lines[$this->a->id]->receipt_note);
        $this->assertNull($lines[$this->b->id]->received_quantity, 'a line not counted keeps no count, so it lands in full');
    }

    #[Test]
    public function damaged_cannot_exceed_what_arrived(): void
    {
        $shipment = $this->shipment();

        $this->receipt($shipment, [['item_variant_id' => $this->a->id, 'received' => 3, 'damaged' => 4]])
            ->assertRedirect()->assertSessionHas('error', 'Damaged units are part of what arrived, so they cannot be more than it.');

        $this->assertNull($shipment->items()->where('item_variant_id', $this->a->id)->value('received_quantity'));
    }

    #[Test]
    public function a_count_needs_lines_with_whole_non_negative_numbers(): void
    {
        $shipment = $this->shipment();

        $this->receipt($shipment, [])->assertSessionHasErrors('lines');
        $this->receipt($shipment, [['item_variant_id' => $this->a->id, 'received' => -1]])->assertSessionHasErrors('lines.0.received');
        $this->receipt($shipment, [['item_variant_id' => $this->a->id]])->assertSessionHasErrors('lines.0.received');
        $this->receipt($shipment, [['received' => 1]])->assertSessionHasErrors('lines.0.item_variant_id');
    }

    #[Test]
    public function goods_are_counted_only_once_the_driver_has_arrived(): void
    {
        $shipment = $this->shipment(Workflow::IN_TRANSIT);

        $this->receipt($shipment, [['item_variant_id' => $this->a->id, 'received' => 10]])
            ->assertSessionHas('error', 'Count the goods once the driver has arrived, before signing them in.');
    }

    #[Test]
    public function a_keeper_of_an_unrelated_store_cannot_count_the_run(): void
    {
        $shipment = $this->shipment();
        $stranger = Store::factory()->create(['name' => 'Elsewhere', 'type' => Store::TYPE_RETAIL]);
        $this->keeper = $this->user('stock_keeper', $stranger->id);

        $this->receipt($shipment, [['item_variant_id' => $this->a->id, 'received' => 10]])->assertForbidden();
    }
}
