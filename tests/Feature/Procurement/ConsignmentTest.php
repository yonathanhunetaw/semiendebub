<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Inventory\ItemStock;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentCost;
use App\Models\Procurement\ConsignmentLine;
use App\Models\Procurement\ExchangeRate;
use App\Models\Procurement\FreightRoute;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\PurchaseLine;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\Tariff;
use App\Models\Store\Store;
use App\Services\Procurement\ConsignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Inertia\Testing\AssertableInertia as Assert;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Procurement pipeline PP4: consignments. Ordered goods travel stage by stage
 * (overseas warehouse → at sea → sea port → dry port), held in the ledger at
 * each; every cost on the way is confirmed by a second person and spread
 * over the goods by CBM, value or weight.
 */
class ConsignmentTest extends TestCase
{
    use RefreshDatabase;

    private User $buyer;

    private Purchase $order;

    private PurchaseLine $drives;

    private PurchaseLine $cables;

    private FreightRoute $route;

    protected function setUp(): void
    {
        parent::setUp();

        $this->buyer = $this->user('procurement');
        $supplier = Supplier::factory()->create(['name' => 'Shenzhen Memory Co']);
        $this->order = Purchase::query()->create([
            'reference_number' => 'PO-T-1', 'supplier_id' => $supplier->id, 'supplier_name' => $supplier->name,
            'currency' => 'USD', 'exchange_rate' => 150, 'status' => Purchase::STATUS_ORDERED,
        ]);
        // 1,000 drives at USD 2 (ETB 300,000), 0.5 CBM, 100 kg; 500 cables at USD 4 (ETB 300,000), 1.5 CBM, 300 kg.
        $this->drives = $this->line(1000, 2, 0.5, 100, '85235100');
        $this->cables = $this->line(500, 4, 1.5, 300, '85444200');

        $this->route = FreightRoute::query()->create([
            'name' => 'Guangzhou → Djibouti → Modjo', 'currency' => 'USD',
            'overseas_storage_per_cbm' => 0, 'sea_freight_per_cbm' => 200, 'insurance_pct' => 0,
            'port_clearing_per_cbm' => 0, 'land_transport_per_cbm' => 0, 'to_store_per_cbm' => 0, 'is_active' => true,
        ]);
        ExchangeRate::query()->create(['currency' => 'USD', 'rate' => 150]);
    }

    private function user(string $role, ?Store $store = null): User
    {
        Role::findOrCreate($role);
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now(), 'store_id' => $store?->id]);
        $user->assignRole($role);

        return $user;
    }

    private function line(int $quantity, float $price, float $cbm, float $kg, string $hs): PurchaseLine
    {
        $item = Item::factory()->create(['status' => 'active', 'hs_code' => $hs]);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        return $this->order->lines()->create([
            'item_variant_id' => $variant->id, 'quantity' => $quantity, 'unit_price' => $price,
            'line_total' => $quantity * $price, 'cbm' => $cbm, 'weight_kg' => $kg,
        ]);
    }

    private function on(string $app, User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => $app.'.'.config('app.system_domain')]);
        $this->actingAs($user);

        return $this;
    }

    private function consignment(): Consignment
    {
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.store'), ['freight_route_id' => $this->route->id])->assertRedirect();

        return Consignment::query()->latest('id')->firstOrFail();
    }

    private function putOn(Consignment $c, PurchaseLine $line, int $quantity): TestResponse
    {
        return $this->on('procurement', $this->buyer)->post(route('procurement.consignments.lines.store', $c), ['purchase_line_id' => $line->id, 'quantity' => $quantity]);
    }

    private function advance(Consignment $c, string $to, ?User $by = null): TestResponse
    {
        return $this->on('procurement', $by ?? $this->buyer)->post(route('procurement.consignments.advance', $c), ['to' => $to]);
    }

    /** Both lines in full, at sea. */
    private function atSea(): Consignment
    {
        $c = $this->consignment();
        $this->putOn($c, $this->drives, 1000)->assertSessionHas('success');
        $this->putOn($c, $this->cables, 500)->assertSessionHas('success');
        $this->advance($c, 'at_sea')->assertSessionHas('success');

        return $c->refresh();
    }

    private function cost(Consignment $c, array $data): ConsignmentCost
    {
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.costs.store', $c), $data + ['stage' => $c->stage, 'currency' => 'ETB'])
            ->assertSessionHas('success');

        return ConsignmentCost::query()->latest('id')->firstOrFail();
    }

    private function stockAt(string $code, PurchaseLine $line): int
    {
        return (int) ItemStock::query()
            ->where('item_variant_id', $line->item_variant_id)
            ->whereIn('stock_location_id', StockLocation::query()->where('code', $code)->select('id'))
            ->sum('quantity');
    }

    // ---- Forming ----

    #[Test]
    public function a_line_goes_on_in_part_with_its_share_of_size_and_its_value_at_the_orders_rate(): void
    {
        $c = $this->consignment();
        $this->assertSame('forming', $c->stage);
        $this->assertStringStartsWith('CN-', $c->reference);

        $this->putOn($c, $this->drives, 400)->assertSessionHas('success');

        $line = ConsignmentLine::query()->sole();
        $this->assertSame(0.2, (float) $line->cbm);                  // 0.5 × 400/1000
        $this->assertSame(40.0, (float) $line->weight_kg);
        $this->assertSame(120000.0, (float) $line->goods_value_etb); // 400 × 2 × 150
    }

    #[Test]
    public function never_more_than_is_left_of_a_line_across_consignments(): void
    {
        $first = $this->consignment();
        $this->putOn($first, $this->drives, 700)->assertSessionHas('success');
        $second = $this->consignment();

        $this->putOn($second, $this->drives, 301)->assertSessionHas('error');
        $this->putOn($second, $this->drives, 300)->assertSessionHas('success');
        $this->putOn($second, $this->drives, 1)->assertSessionHas('error');   // already on it
    }

    #[Test]
    public function only_a_placed_orders_lines_can_travel(): void
    {
        $this->order->update(['status' => Purchase::STATUS_APPROVED]);

        $this->putOn($this->consignment(), $this->drives, 10)->assertSessionHas('error');
        $this->assertSame(0, ConsignmentLine::query()->count());
    }

    #[Test]
    public function an_empty_consignment_cannot_move_and_a_formed_one_can_be_cancelled(): void
    {
        $c = $this->consignment();

        $this->advance($c, 'overseas_warehouse')->assertSessionHas('error');
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.cancel', $c))->assertSessionHas('success');

        $this->assertSame(Consignment::CANCELLED, $c->refresh()->stage);
    }

    // ---- Stages move the stock ----

    #[Test]
    public function the_first_stage_books_the_goods_into_the_ledger_and_later_stages_move_them(): void
    {
        $c = $this->consignment();
        $this->putOn($c, $this->drives, 1000);

        $this->advance($c, 'overseas_warehouse')->assertSessionHas('success');
        $this->assertSame(1000, $this->stockAt('INBOUND-OVERSEAS', $this->drives));

        // A stage may be skipped, never gone back to.
        $this->advance($c, 'sea_port')->assertSessionHas('success');
        $this->assertSame(0, $this->stockAt('INBOUND-OVERSEAS', $this->drives));
        $this->assertSame(1000, $this->stockAt('INBOUND-SEA-PORT', $this->drives));
        $this->advance($c, 'at_sea')->assertSessionHas('error');

        $this->advance($c, 'dry_port')->assertSessionHas('success');
        $this->assertSame(1000, $this->stockAt('INBOUND-DRY-PORT', $this->drives));
        $this->assertSame(1000, (int) ItemStock::query()->where('item_variant_id', $this->drives->item_variant_id)->sum('quantity'));

        $c->refresh();
        $this->assertSame(['forming', 'overseas_warehouse', 'sea_port', 'dry_port'], array_keys($c->stage_dates));

        $dryPort = StockLocation::query()->where('code', 'INBOUND-DRY-PORT')->sole();
        $this->assertSame([StockLocation::KIND_INBOUND, null], [$dryPort->kind, $dryPort->store_id]);
    }

    #[Test]
    public function goods_on_their_way_in_are_not_on_hand_in_the_stock_keeper_lists(): void
    {
        $this->atSea();

        $metrics = app(\App\Services\StockKeeperService::class)->metrics();
        $this->assertSame(0, (int) ($metrics['units_on_hand'] ?? 0));
    }

    #[Test]
    public function goods_on_their_way_cannot_be_taken_off_or_cancelled(): void
    {
        $c = $this->atSea();

        $this->on('procurement', $this->buyer)->delete(route('procurement.consignments.lines.destroy', $c->lines()->first()))->assertSessionHas('error');
        $this->on('procurement', $this->buyer)->post(route('procurement.consignments.cancel', $c))->assertSessionHas('error');
        $this->putOn($c, $this->drives, 1)->assertSessionHas('error');
    }

    #[Test]
    public function an_order_whose_goods_are_on_a_consignment_cannot_be_cancelled_under_them(): void
    {
        $this->atSea();

        $this->expectException(\App\Exceptions\PurchaseOrderException::class);

        try {
            app(\App\Services\Procurement\PurchaseOrderService::class)->cancel($this->order, $this->buyer, 'Supplier gone');
        } finally {
            $this->assertSame(Purchase::STATUS_ORDERED, $this->order->fresh()->status);
        }
    }

    // ---- Costs, two people ----

    #[Test]
    public function a_cost_in_dollars_is_kept_in_etb_at_todays_rate(): void
    {
        $c = $this->atSea();

        $cost = $this->cost($c, ['kind' => 'freight', 'currency' => 'USD', 'amount' => 400]);

        $this->assertSame([150.0, 60000.0, 'cbm', false], [(float) $cost->exchange_rate, (float) $cost->amount_etb, $cost->allocation, $cost->recoverable]);
        $this->assertSame(ConsignmentCost::PENDING, $cost->state());
    }

    #[Test]
    public function vat_and_withholding_are_marked_recoverable_by_default(): void
    {
        $c = $this->atSea();

        $this->assertTrue($this->cost($c, ['kind' => 'vat', 'amount' => 1000])->recoverable);
        $this->assertTrue($this->cost($c, ['kind' => 'withholding', 'amount' => 1000])->recoverable);
        $this->assertFalse($this->cost($c, ['kind' => 'duty', 'amount' => 1000])->recoverable);
    }

    #[Test]
    public function the_recorder_and_procurement_never_confirm_finance_and_a_global_admin_do(): void
    {
        $c = $this->atSea();
        $a = $this->cost($c, ['kind' => 'freight', 'amount' => 1000]);
        $b = $this->cost($c, ['kind' => 'port', 'amount' => 500]);

        $this->on('procurement', $this->buyer)->post(route('procurement.import_costs.confirm', $a))->assertSessionHas('error');
        $this->on('procurement', $this->user('procurement'))->post(route('procurement.import_costs.confirm', $a))->assertSessionHas('error');
        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.confirm', $a))->assertSessionHas('success');
        $this->on('admin', $this->user('admin'))->post(route('admin.import_costs.confirm', $b))->assertSessionHas('success');

        // Settled once.
        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.reject', $a), ['reason' => 'Wrong invoice'])->assertSessionHas('error');
        $this->assertSame([ConsignmentCost::CONFIRMED, ConsignmentCost::CONFIRMED], [$a->refresh()->state(), $b->refresh()->state()]);
    }

    #[Test]
    public function a_store_admin_cannot_open_the_import_cost_inbox(): void
    {
        $this->on('admin', $this->user('admin', Store::factory()->create()))->get(route('admin.import_costs.index'))->assertForbidden();
    }

    #[Test]
    public function rejecting_needs_a_reason_and_the_recorder_may_take_a_waiting_cost_back(): void
    {
        $c = $this->atSea();
        $a = $this->cost($c, ['kind' => 'freight', 'amount' => 1000]);
        $b = $this->cost($c, ['kind' => 'port', 'amount' => 500]);

        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.reject', $a), ['reason' => ''])->assertSessionHasErrors('reason');
        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.reject', $a), ['reason' => 'Wrong invoice'])->assertSessionHas('success');

        $this->on('procurement', $this->user('procurement'))->delete(route('procurement.consignments.costs.destroy', $b))->assertSessionHas('error');
        $this->on('procurement', $this->buyer)->delete(route('procurement.consignments.costs.destroy', $b))->assertSessionHas('success');
        $this->assertSame(1, ConsignmentCost::query()->count());
    }

    // ---- Spreading ----

    #[Test]
    public function confirmed_costs_spread_by_cbm_or_value_and_vat_stays_out_of_the_goods_cost(): void
    {
        $c = $this->atSea();
        $finance = $this->user('finance');
        $confirm = fn (ConsignmentCost $x) => $this->on('finance', $finance)->post(route('finance.import_costs.confirm', $x))->assertSessionHas('success');

        $confirm($this->cost($c, ['kind' => 'freight', 'amount' => 1000]));   // by CBM: 0.5 / 1.5
        $confirm($this->cost($c, ['kind' => 'duty', 'amount' => 6000]));      // by value: 300,000 / 300,000
        $confirm($this->cost($c, ['kind' => 'vat', 'amount' => 9000]));       // claimed back
        $this->cost($c, ['kind' => 'port', 'amount' => 777]);                // not confirmed: does not count

        $lines = collect(app(ConsignmentService::class)->allocation($c->refresh())['lines'])->keyBy('id');
        $drives = $lines[$c->lines()->where('purchase_line_id', $this->drives->id)->value('id')];
        $cables = $lines[$c->lines()->where('purchase_line_id', $this->cables->id)->value('id')];

        $this->assertSame([250.0 + 3000.0, 750.0 + 3000.0], [$drives['costs_etb'], $cables['costs_etb']]);
        $this->assertSame([4500.0, 4500.0], [$drives['recoverable_etb'], $cables['recoverable_etb']]);
        $this->assertSame(303.25, $drives['landed_unit_etb']);   // (300,000 + 3,250) / 1,000
        $this->assertSame(607.5, $cables['landed_unit_etb']);    // (300,000 + 3,750) / 500
    }

    #[Test]
    public function a_split_always_adds_up_to_the_cent(): void
    {
        $this->assertSame([1 => 33.34, 2 => 33.33, 3 => 33.33], ConsignmentService::split(100.0, [1 => 1.0, 2 => 1.0, 3 => 1.0]));
        $this->assertSame(1000.0, array_sum(ConsignmentService::split(1000.0, [1 => 0.3, 2 => 0.3, 3 => 0.4])));
    }

    #[Test]
    public function by_weight_with_no_weights_falls_back_to_value_and_says_so(): void
    {
        $c = $this->atSea();
        $c->lines()->update(['weight_kg' => null]);
        $cost = $this->cost($c, ['kind' => 'misc', 'description' => 'Fumigation', 'amount' => 100, 'allocation' => 'weight']);
        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.confirm', $cost))->assertSessionHas('success');

        $result = app(ConsignmentService::class)->allocation($c->refresh());

        $this->assertSame([50.0, 50.0], array_column($result['lines'], 'costs_etb'));
        $this->assertCount(1, $result['warnings']);
    }

    #[Test]
    public function the_estimate_from_the_route_and_tariff_sits_beside_what_was_paid(): void
    {
        Tariff::query()->create(['hs_code' => '85235100', 'duty_pct' => 10]);
        $c = $this->atSea();
        $freight = $this->cost($c, ['kind' => 'freight', 'amount' => 70000]);
        $this->on('finance', $this->user('finance'))->post(route('finance.import_costs.confirm', $freight))->assertSessionHas('success');

        $rows = collect(app(ConsignmentService::class)->comparison($c->refresh()))->keyBy('kind');

        // 2 CBM × USD 200 × 150; duty 10% of the drives' CIF (300,000 + their 15,000 freight).
        $this->assertSame(60000.0, $rows['freight']['estimated']);
        $this->assertSame(70000.0, $rows['freight']['actual']);
        $this->assertSame(31500.0, $rows['duty']['estimated']);
        $this->assertSame(0.0, $rows['duty']['actual']);
    }

    // ---- Screens ----

    #[Test]
    public function the_procurement_screens_open(): void
    {
        $c = $this->consignment();

        $this->on('procurement', $this->buyer)->get(route('procurement.consignments.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Procurement/Consignments/Index')->where('consignments.0.id', $c->id));
        $this->on('procurement', $this->buyer)->get(route('procurement.consignments.show', $c))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Procurement/Consignments/Show')
                ->has('available', 2)
                ->where('consignment.next_stages.0.stage', 'overseas_warehouse')
                ->where('consignment.can_manage', true));
    }

    #[Test]
    public function procurement_fills_in_the_shipping_papers(): void
    {
        $c = $this->consignment();

        $this->on('procurement', $this->buyer)->put(route('procurement.consignments.update', $c), ['eta' => '30/11/2026'])->assertSessionHasErrors('eta');
        $this->on('procurement', $this->buyer)->put(route('procurement.consignments.update', $c), [
            'freight_route_id' => $this->route->id, 'container_number' => 'MSKU1234567', 'bill_of_lading' => 'BL-889', 'eta' => '2026-11-30', 'notes' => 'Fragile',
        ])->assertSessionHas('success', 'Saved.');

        $c->refresh();
        $this->assertSame(['MSKU1234567', 'BL-889', '2026-11-30', 'Fragile'], [$c->container_number, $c->bill_of_lading, $c->eta->toDateString(), $c->notes]);

        $this->on('finance', $this->user('finance'))->put(route('procurement.consignments.update', $c), ['notes' => 'Mine'])->assertForbidden();
        $this->assertSame('Fragile', $c->refresh()->notes);
    }

    #[Test]
    public function the_inboxes_open_for_finance_and_a_global_admin(): void
    {
        $this->cost($this->atSea(), ['kind' => 'freight', 'amount' => 1000]);

        $this->on('finance', $this->user('finance'))->get(route('finance.import_costs.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Finance/ImportCosts/Index')->has('waiting', 1)->where('waiting.0.can_confirm', true));
        $this->on('admin', $this->user('admin'))->get(route('admin.import_costs.index'))->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('Admin/ImportCosts/Index')->has('waiting', 1));
    }
}
