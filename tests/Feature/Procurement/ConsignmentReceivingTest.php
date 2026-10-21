<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Inventory\ItemStock;
use App\Models\Inventory\ReceiptDiscrepancy;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentCost;
use App\Models\Procurement\ItemCostEntry;
use App\Models\Procurement\ProductIdea;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\PurchaseLine;
use App\Models\Procurement\Supplier;
use App\Models\Store\Store;
use App\Services\StockService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Procurement pipeline PP5: the goods are counted in at a Main Hub, the order
 * shows what arrived, and once every cost is confirmed the costs are
 * finalised into each SKU's weighted-average cost.
 */
class ConsignmentReceivingTest extends TestCase
{
    use RefreshDatabase;

    private User $buyer;

    private User $keeper;

    private Purchase $order;

    private PurchaseLine $drives;

    private PurchaseLine $cables;

    private StockLocation $hub;

    private Consignment $consignment;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buyer = $this->user('procurement');
        $this->keeper = $this->user('stock_keeper');
        $this->hub = StockLocation::query()->legacy(Warehouse::class, Warehouse::create(['name' => 'Main Distribution Hub A', 'code' => 'WH-MAIN-01'])->id)->sole();

        $supplier = Supplier::factory()->create();
        $this->order = Purchase::query()->create([
            'reference_number' => 'PO-T-1', 'supplier_id' => $supplier->id, 'supplier_name' => $supplier->name,
            'currency' => 'USD', 'exchange_rate' => 150, 'status' => Purchase::STATUS_ORDERED,
        ]);
        // ETB 300,000 of each: 1,000 drives (0.5 CBM) and 500 cables (1.5 CBM).
        $this->drives = $this->line(1000, 2, 0.5);
        $this->cables = $this->line(500, 4, 1.5);

        $this->consignment = $this->atDryPort([$this->drives, $this->cables]);
    }

    private function user(string $role, ?Store $store = null): User
    {
        Role::findOrCreate($role);
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now(), 'store_id' => $store?->id]);
        $user->assignRole($role);

        return $user;
    }

    private function line(int $quantity, float $price, float $cbm): PurchaseLine
    {
        $variant = ItemVariant::factory()->create(['item_id' => Item::factory()->create(['status' => 'active'])->id]);

        return $this->order->lines()->create([
            'item_variant_id' => $variant->id, 'quantity' => $quantity, 'unit_price' => $price, 'line_total' => $quantity * $price, 'cbm' => $cbm,
        ]);
    }

    private function on(string $app, User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => $app.'.'.config('app.system_domain')]);
        $this->actingAs($user);

        return $this;
    }

    /** @param  array<int, PurchaseLine>  $lines */
    private function atDryPort(array $lines): Consignment
    {
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.store'), [])->assertRedirect();
        $c = Consignment::query()->latest('id')->firstOrFail();
        foreach ($lines as $line) {
            $this->on('procurement', $this->buyer)->post(route('procurement.consignments.lines.store', $c), ['purchase_line_id' => $line->id, 'quantity' => $line->quantity])->assertSessionHas('success');
        }
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.advance', $c), ['to' => 'dry_port'])->assertSessionHas('success');

        return $c->refresh();
    }

    private function lineOf(PurchaseLine $line): int
    {
        return (int) $this->consignment->lines()->where('purchase_line_id', $line->id)->value('id');
    }

    /** @param  array<int, array<string, mixed>>  $counts  keyed by consignment line id */
    private function receive(array $counts = [], ?User $by = null): TestResponse
    {
        return $this->on('stockkeeper', $by ?? $this->keeper)
            ->post(route('stock_keeper.arrivals.receive', $this->consignment), ['hub_id' => $this->hub->id, 'counts' => $counts]);
    }

    private function at(StockLocation|string $where, PurchaseLine $line): int
    {
        $ids = $where instanceof StockLocation ? [$where->id] : StockLocation::query()->where('code', $where)->pluck('id')->all();

        return (int) ItemStock::query()->where('item_variant_id', $line->item_variant_id)->whereIn('stock_location_id', $ids)->sum('quantity');
    }

    private function confirmedCost(array $data): void
    {
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.costs.store', $this->consignment), $data + ['stage' => 'dry_port', 'currency' => 'ETB'])
            ->assertSessionHas('success');
        $cost = ConsignmentCost::query()->latest('id')->firstOrFail();
        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.confirm', $cost))->assertSessionHas('success');
    }

    // ---- Receiving ----

    #[Test]
    public function a_full_count_moves_everything_into_the_hub_and_the_order_is_received(): void
    {
        $this->receive()->assertSessionHas('success');

        $this->assertSame([1000, 0], [$this->at($this->hub, $this->drives), $this->at('INBOUND-DRY-PORT', $this->drives)]);
        $this->assertSame(500, $this->at($this->hub, $this->cables));
        $this->assertSame([1000, 500], [(int) $this->drives->refresh()->received_quantity, (int) $this->cables->refresh()->received_quantity]);
        $this->assertSame(Purchase::STATUS_RECEIVED, $this->order->refresh()->status);

        $c = $this->consignment->refresh();
        $this->assertSame([Consignment::RECEIVED, 'dry_port', $this->hub->id], [$c->stage, $c->received_from, (int) $c->received_location_id]);
        $this->receive()->assertSessionHas('error');   // once
    }

    #[Test]
    public function short_damaged_and_over_are_each_handled(): void
    {
        $this->receive([
            $this->lineOf($this->drives) => ['received' => 950, 'damaged' => 10, 'note' => 'Wet carton'],
            $this->lineOf($this->cables) => ['received' => 520],
        ])->assertSessionHas('success');

        // 950 arrived, 10 broken: 940 at the hub; 50 missing wait at the dry port.
        $this->assertSame([940, 50], [$this->at($this->hub, $this->drives), $this->at('INBOUND-DRY-PORT', $this->drives)]);
        $this->assertSame(520, $this->at($this->hub, $this->cables));
        $this->assertSame(Purchase::STATUS_PARTIALLY_RECEIVED, $this->order->refresh()->status);

        $kinds = ReceiptDiscrepancy::query()->orderBy('id')->get(['kind', 'quantity', 'status'])->map(fn ($r) => [$r->kind, (int) $r->quantity, $r->status])->all();
        $this->assertSame([
            [ReceiptDiscrepancy::SHORT, 50, ReceiptDiscrepancy::OPEN],
            [ReceiptDiscrepancy::DAMAGED, 10, ReceiptDiscrepancy::RESOLVED],
            [ReceiptDiscrepancy::OVER, 20, ReceiptDiscrepancy::OPEN],
        ], $kinds);
    }

    #[Test]
    public function missing_units_found_later_move_in_and_complete_the_order(): void
    {
        $this->receive([$this->lineOf($this->drives) => ['received' => 950]]);
        $short = ReceiptDiscrepancy::query()->where('kind', ReceiptDiscrepancy::SHORT)->sole();

        // The receiver never settles their own count.
        $this->on('stockkeeper', $this->keeper)->post(route('stock_keeper.receiving.resolve', $short), ['resolution' => 'found'])->assertSessionHas('error');
        $this->on('stockkeeper', $this->user('stock_keeper'))->post(route('stock_keeper.receiving.resolve', $short), ['resolution' => 'found'])->assertSessionHas('success');

        $this->assertSame([1000, 0], [$this->at($this->hub, $this->drives), $this->at('INBOUND-DRY-PORT', $this->drives)]);
        $this->assertSame(1000, (int) $this->drives->refresh()->received_quantity);
        $this->assertSame(Purchase::STATUS_RECEIVED, $this->order->refresh()->status);
    }

    #[Test]
    public function missing_units_lost_are_written_off_at_the_dry_port(): void
    {
        $this->receive([$this->lineOf($this->drives) => ['received' => 950]]);
        $short = ReceiptDiscrepancy::query()->where('kind', ReceiptDiscrepancy::SHORT)->sole();

        $this->on('stockkeeper', $this->user('stock_keeper'))->post(route('stock_keeper.receiving.resolve', $short), ['resolution' => 'lost'])->assertSessionHas('success');

        $this->assertSame([950, 0], [$this->at($this->hub, $this->drives), $this->at('INBOUND-DRY-PORT', $this->drives)]);
        $this->assertSame(Purchase::STATUS_PARTIALLY_RECEIVED, $this->order->refresh()->status);
    }

    #[Test]
    public function damaged_cannot_exceed_what_arrived(): void
    {
        $this->receive([$this->lineOf($this->drives) => ['received' => 5, 'damaged' => 6]])->assertSessionHasErrors();

        $this->assertSame('dry_port', $this->consignment->refresh()->stage);
    }

    #[Test]
    public function only_the_hubs_people_or_a_global_admin_receive(): void
    {
        $this->hub->syncStaff([$this->user('stock_keeper')->id]);

        $this->receive([], $this->keeper)->assertSessionHas('error');
        $this->receive([], $this->user('procurement'))->assertForbidden();   // not their app
        $this->receive([], $this->user('admin'))->assertSessionHas('success');
    }

    #[Test]
    public function the_arrivals_page_shows_quantities_and_never_money(): void
    {
        $this->on('stockkeeper', $this->keeper)->get(route('stock_keeper.arrivals.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('StockKeeper/Arrivals/Index')
                ->where('consignments.0.id', $this->consignment->id)
                ->where('hubs.0.id', $this->hub->id)
                ->missing('consignments.0.goods_value_etb')
                ->missing('consignments.0.lines.0.goods_value_etb'));
    }

    // ---- Finalising the costs ----

    #[Test]
    public function costs_are_finalised_only_after_receiving_and_with_nothing_waiting(): void
    {
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.finalise', $this->consignment))->assertSessionHas('error');

        $this->receive();
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.costs.store', $this->consignment), ['stage' => 'dry_port', 'currency' => 'ETB', 'kind' => 'land', 'amount' => 800])
            ->assertSessionHas('success');   // a late invoice is still welcome
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.finalise', $this->consignment))->assertSessionHas('error');

        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.confirm', ConsignmentCost::query()->sole()));
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.finalise', $this->consignment))->assertSessionHas('success');

        // Finalised: nothing more is added.
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.costs.store', $this->consignment), ['stage' => 'dry_port', 'currency' => 'ETB', 'kind' => 'misc', 'description' => 'Late', 'amount' => 5])
            ->assertSessionHas('error');
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.finalise', $this->consignment))->assertSessionHas('error');
    }

    #[Test]
    public function a_new_sku_takes_the_batch_cost_carried_by_the_units_that_arrived_whole(): void
    {
        $this->confirmedCost(['kind' => 'freight', 'amount' => 2000]);    // by CBM: 500 / 1,500
        $this->confirmedCost(['kind' => 'vat', 'amount' => 9000]);        // claimed back
        $this->receive([$this->lineOf($this->drives) => ['received' => 1000, 'damaged' => 50]]);

        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.finalise', $this->consignment))->assertSessionHas('success');

        // Drives: (300,000 + 500) ÷ 950 whole units; cables: (300,000 + 1,500) ÷ 500.
        $this->assertSame(316.3158, (float) ItemVariant::find($this->drives->item_variant_id)->unit_cost);
        $this->assertSame(603.0, (float) ItemVariant::find($this->cables->item_variant_id)->unit_cost);

        $entry = ItemCostEntry::query()->where('item_variant_id', $this->drives->item_variant_id)->sole();
        $this->assertSame([950, 0, null], [$entry->quantity, $entry->on_hand_before, $entry->cost_before]);
        $this->assertNotNull($this->consignment->refresh()->costs_finalised_at);
    }

    #[Test]
    public function a_sku_already_on_hand_takes_the_weighted_average(): void
    {
        // 1,000 drives already at the hub, costed at ETB 250.
        app(StockService::class)->receive($this->drives->item_variant_id, $this->hub, 1000);
        ItemVariant::find($this->drives->item_variant_id)->forceFill(['unit_cost' => 250])->save();

        $this->receive();
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.finalise', $this->consignment))->assertSessionHas('success');

        // (1,000 × 250 + 1,000 × 300) ÷ 2,000
        $this->assertSame(275.0, (float) ItemVariant::find($this->drives->item_variant_id)->unit_cost);
        $entry = ItemCostEntry::query()->where('item_variant_id', $this->drives->item_variant_id)->sole();
        $this->assertSame([1000, 250.0, 300.0, 275.0], [$entry->on_hand_before, (float) $entry->cost_before, (float) $entry->batch_unit_cost, (float) $entry->cost_after]);
    }

    #[Test]
    public function only_procurement_or_a_global_admin_finalise(): void
    {
        $this->receive();

        $this->on('finance', $this->user('finance'))->post(route('procurement.consignments.finalise', $this->consignment))->assertForbidden();
        $this->on('procurement', $this->user('admin'))->post(route('procurement.consignments.finalise', $this->consignment))->assertSessionHas('success');
    }

    #[Test]
    public function the_procurement_page_shows_the_receipt_and_what_blocks_finalising(): void
    {
        $this->receive([$this->lineOf($this->drives) => ['received' => 990]]);
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.costs.store', $this->consignment), ['stage' => 'dry_port', 'currency' => 'ETB', 'kind' => 'port', 'amount' => 100]);

        $this->on('procurement', $this->buyer)->get(route('procurement.consignments.show', $this->consignment))->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('consignment.received.location', 'Main Distribution Hub A')
                ->where('consignment.received.open_discrepancies', 1)
                ->where('consignment.finalise_blocker', 'A cost is still waiting to be confirmed.')
                ->where('consignment.can_record_costs', true)
                ->where('consignment.lines_detail.0.received_quantity', 990));
    }

    // ---- The idea is bought ----

    #[Test]
    public function an_approved_idea_is_bought_on_an_order_line_and_takes_its_item(): void
    {
        $idea = ProductIdea::factory()->create(['status' => ProductIdea::APPROVED]);
        $suggested = ProductIdea::factory()->create(['status' => ProductIdea::SUGGESTED]);

        $this->on('procurement', $this->buyer)->post(route('procurement.ideas.bought', $suggested), ['purchase_line_id' => $this->drives->id])->assertSessionHas('error');
        $this->on('procurement', $this->buyer)->post(route('procurement.ideas.bought', $idea), ['purchase_line_id' => $this->drives->id])->assertSessionHas('success');

        $idea->refresh();
        $this->assertSame(ProductIdea::BOUGHT, $idea->status);
        $this->assertSame([$this->drives->variant->item_id, $this->drives->id], [(int) $idea->item_id, (int) $idea->purchase_line_id]);
        $this->assertSame('On order PO-T-1', $idea->events()->latest('id')->value('note'));

        $this->on('procurement', $this->buyer)->get(route('procurement.ideas.index', ['tab' => 'all']))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->has('orderLines', 2));
    }
}
