<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Admin → Inventory → Transfers when a step does not apply: an unapproved
 * proposal cannot be dispatched or completed, a cancelled or finished one
 * cannot move again, and a collected transfer keeps its courier.
 */
class AdminTransferRefusalsTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
        $this->actingAs($admin);
    }

    private function transfer(array $attributes = []): Transfer
    {
        return Transfer::query()->create($attributes + [
            'reference' => 'TRF-'.uniqid(), 'item_variant_id' => ItemVariant::factory()->create(['item_id' => Item::factory()->create()->id])->id,
            'from_store_id' => $this->store->id, 'to_store_id' => $this->store->id,
            'source_location_type' => Store::class, 'source_location_id' => $this->store->id,
            'destination_location_type' => Store::class, 'destination_location_id' => $this->store->id,
            'quantity' => 2, 'status' => 'pending', 'origin' => Transfer::ORIGIN_AUTO, 'approval_state' => Transfer::APPROVAL_PENDING,
        ]);
    }

    #[Test]
    public function an_unapproved_proposal_can_neither_be_dispatched_nor_completed(): void
    {
        $proposal = $this->transfer();

        $this->patch(route('admin.inventory.transfers.dispatch', $proposal))
            ->assertSessionHas('error', 'Only a pending, approved transfer can be dispatched.');
        $this->patch(route('admin.inventory.transfers.complete', $proposal))
            ->assertSessionHas('error', 'This transfer cannot be dispatched yet.');

        $this->assertSame('pending', $proposal->fresh()->status);
    }

    #[Test]
    public function a_cancelled_or_completed_transfer_cannot_move_again(): void
    {
        $cancelled = $this->transfer(['status' => 'cancelled', 'approval_state' => Transfer::APPROVAL_NOT_REQUIRED]);
        $this->patch(route('admin.inventory.transfers.complete', $cancelled))
            ->assertSessionHas('error', 'Only a transfer in transit can be completed.');

        $done = $this->transfer(['status' => 'completed', 'approval_state' => Transfer::APPROVAL_NOT_REQUIRED]);
        $this->patch(route('admin.inventory.transfers.cancel', $done))
            ->assertSessionHas('error', 'A completed transfer cannot be cancelled.');
        $this->assertSame('completed', $done->fresh()->status);
    }

    #[Test]
    public function a_finished_transfer_keeps_its_courier(): void
    {
        $courier = User::factory()->create(['role' => 'delivery']);
        $courier->assignRole('delivery');
        $done = $this->transfer(['status' => 'completed', 'approval_state' => Transfer::APPROVAL_NOT_REQUIRED]);

        $this->patch(route('admin.inventory.transfers.courier', $done), ['courier_id' => $courier->id])
            ->assertSessionHas('error', 'A collected transfer keeps its courier.');
        $this->assertNull($done->fresh()->courier_id);
    }
}
