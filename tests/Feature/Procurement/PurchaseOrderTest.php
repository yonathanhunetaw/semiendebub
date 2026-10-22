<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use App\Models\Store\Store;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Procurement P1: suppliers and purchase orders. A draft is raised with lines,
 * submitted, approved by a second person within their limit, then placed.
 */
class PurchaseOrderTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplier;

    protected function setUp(): void
    {
        parent::setUp();

        config(['procurement.admin_approval_etb' => 500000]);
        $this->supplier = Supplier::factory()->create(['currency' => 'USD', 'default_payment_terms' => 'installments']);
    }

    private function user(string $role, array $attributes = []): User
    {
        Role::findOrCreate($role);
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now()] + $attributes);
        $user->assignRole($role);

        return $user;
    }

    private function as(User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => 'procurement.'.config('app.system_domain')]);
        $this->actingAs($user);

        return $this;
    }

    private function variant(): ItemVariant
    {
        $item = Item::factory()->create(['status' => 'active']);

        return ItemVariant::factory()->create(['item_id' => $item->id]);
    }

    /** @return array<string, mixed> */
    private function payload(array $lines, array $overrides = []): array
    {
        return $overrides + [
            'supplier_id' => $this->supplier->id,
            'currency' => 'USD',
            'exchange_rate' => 125.5,
            'payment_terms' => 'immediate',
            'lines' => $lines,
        ];
    }

    /** A draft worth about $usd at 125.5 ETB to the dollar, raised by $buyer. */
    private function draft(User $buyer, float $usd = 1000): Purchase
    {
        $this->as($buyer)->post(route('procurement.purchase_orders.store'), $this->payload([
            ['item_variant_id' => $this->variant()->id, 'quantity' => 10, 'unit_price' => $usd / 10],
        ]))->assertSessionHasNoErrors();

        return Purchase::query()->latest('id')->firstOrFail();
    }

    private function submitted(User $buyer, float $usd = 1000): Purchase
    {
        $purchase = $this->draft($buyer, $usd);
        $this->as($buyer)->post(route('procurement.purchase_orders.submit', $purchase));

        return $purchase->refresh();
    }

    #[Test]
    public function a_draft_totals_its_lines_in_the_supplier_currency_and_in_etb(): void
    {
        $buyer = $this->user('procurement');
        $a = $this->variant();
        $b = $this->variant();

        $this->as($buyer)->post(route('procurement.purchase_orders.store'), $this->payload([
            ['item_variant_id' => $a->id, 'quantity' => 12, 'unit_price' => 3.335, 'cbm' => 0.5, 'weight_kg' => 40],
            ['item_variant_id' => $b->id, 'quantity' => 5, 'unit_price' => 100],
        ]))->assertRedirect();

        $purchase = Purchase::query()->with('lines')->sole();

        $this->assertSame(Purchase::STATUS_DRAFT, $purchase->status);
        $this->assertMatchesRegularExpression('/^PO-\d{4}-0001$/', $purchase->reference_number);
        $this->assertSame($this->supplier->name, $purchase->supplier_name);
        $this->assertNull($purchase->store_id, 'Orders are central.');
        $this->assertSame('USD', $purchase->currency);
        // 12 × 3.335 = 40.02, + 500 = 540.02 USD; × 125.5 = 67,772.51 ETB
        $this->assertSame('40.02', $purchase->lines->firstWhere('item_variant_id', $a->id)->line_total);
        $this->assertSame('540.02', $purchase->subtotal_foreign);
        $this->assertSame('67772.51', $purchase->total_amount);
        $this->assertSame('immediate', $purchase->payment_terms);
    }

    #[Test]
    public function an_etb_order_always_has_a_rate_of_one(): void
    {
        $buyer = $this->user('procurement');

        $this->as($buyer)->post(route('procurement.purchase_orders.store'), $this->payload(
            [['item_variant_id' => $this->variant()->id, 'quantity' => 4, 'unit_price' => 250]],
            ['currency' => 'ETB', 'exchange_rate' => 99],
        ))->assertSessionHasNoErrors();

        $purchase = Purchase::query()->sole();
        $this->assertSame('1.000000', $purchase->exchange_rate);
        $this->assertSame('1000.00', $purchase->total_amount);
    }

    #[Test]
    public function a_foreign_order_needs_a_rate_and_lines_and_no_sku_twice(): void
    {
        $buyer = $this->user('procurement');
        $variant = $this->variant();

        $this->as($buyer)->post(route('procurement.purchase_orders.store'), $this->payload([
            ['item_variant_id' => $variant->id, 'quantity' => 1, 'unit_price' => 1],
            ['item_variant_id' => $variant->id, 'quantity' => 2, 'unit_price' => 1],
        ], ['exchange_rate' => null]))->assertSessionHasErrors(['exchange_rate', 'lines.0.item_variant_id']);

        $this->as($buyer)->post(route('procurement.purchase_orders.store'), $this->payload([]))
            ->assertSessionHasErrors('lines');

        $this->assertSame(0, Purchase::query()->count());
    }

    #[Test]
    public function the_buyer_cannot_approve_their_own_order(): void
    {
        $buyer = $this->user('procurement');
        $purchase = $this->submitted($buyer);
        $this->assertSame(Purchase::STATUS_SUBMITTED, $purchase->status);

        $this->as($buyer)->post(route('procurement.purchase_orders.approve', $purchase))
            ->assertSessionHas('error', 'You raised or submitted this order. A second person has to approve it.');

        $this->assertSame(Purchase::STATUS_SUBMITTED, $purchase->refresh()->status);
    }

    #[Test]
    public function another_procurement_user_approves_below_the_limit(): void
    {
        $buyer = $this->user('procurement');
        $approver = $this->user('procurement');
        $purchase = $this->submitted($buyer, 1000); // 125,500 ETB

        $this->as($approver)->post(route('procurement.purchase_orders.approve', $purchase))->assertSessionHas('success');

        $purchase->refresh();
        $this->assertSame(Purchase::STATUS_APPROVED, $purchase->status);
        $this->assertSame($approver->id, (int) $purchase->approved_by);
        $this->assertSame($buyer->id, (int) $purchase->submitted_by);
    }

    #[Test]
    public function from_the_limit_only_a_global_admin_approves(): void
    {
        $buyer = $this->user('procurement');
        $purchase = $this->submitted($buyer, 4000); // 502,000 ETB

        $this->as($this->user('procurement'))->post(route('procurement.purchase_orders.approve', $purchase))
            ->assertSessionHas('error');

        // A store admin does not get into the procurement app at all.
        $storeAdmin = $this->user('admin', ['store_id' => Store::factory()->create()->id]);
        $response = $this->as($storeAdmin)->post(route('procurement.purchase_orders.approve', $purchase));
        $this->assertContains($response->status(), [302, 403]);
        $response->assertSessionMissing('success');

        $this->assertSame(Purchase::STATUS_SUBMITTED, $purchase->refresh()->status);

        $this->as($this->user('admin'))->post(route('procurement.purchase_orders.approve', $purchase))
            ->assertSessionHas('success');

        $this->assertSame(Purchase::STATUS_APPROVED, $purchase->refresh()->status);
    }

    #[Test]
    public function a_global_admin_approves_in_the_admin_app_and_a_store_admin_cannot_open_it(): void
    {
        $purchase = $this->submitted($this->user('procurement'), 4000);
        $admin = $this->user('admin');
        $adminHost = ['HTTP_HOST' => 'admin.'.config('app.system_domain')];

        $this->withServerVariables($adminHost)->actingAs($admin)
            ->get(route('admin.purchase_orders.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/PurchaseOrders/Index')
                ->where('orders.0.id', $purchase->id)
                ->where('orders.0.can.review', true));

        $storeAdmin = $this->user('admin', ['store_id' => Store::factory()->create()->id]);
        $this->withServerVariables($adminHost)->actingAs($storeAdmin)
            ->post(route('admin.purchase_orders.approve', $purchase))->assertForbidden();

        $this->withServerVariables($adminHost)->actingAs($admin)
            ->post(route('admin.purchase_orders.approve', $purchase))->assertSessionHas('success');

        $this->assertSame(Purchase::STATUS_APPROVED, $purchase->refresh()->status);
        $this->assertSame($admin->id, (int) $purchase->approved_by);
    }

    #[Test]
    public function a_global_admin_sends_one_back_from_the_admin_app(): void
    {
        $purchase = $this->submitted($this->user('procurement'), 4000);
        $admin = $this->user('admin');
        $adminHost = ['HTTP_HOST' => 'admin.'.config('app.system_domain')];

        $this->withServerVariables($adminHost)->actingAs($admin)
            ->post(route('admin.purchase_orders.send_back', $purchase), ['reason' => ''])
            ->assertSessionHasErrors('reason');

        $storeAdmin = $this->user('admin', ['store_id' => Store::factory()->create()->id]);
        $this->withServerVariables($adminHost)->actingAs($storeAdmin)
            ->post(route('admin.purchase_orders.send_back', $purchase), ['reason' => 'No'])->assertForbidden();

        $this->withServerVariables($adminHost)->actingAs($admin)
            ->post(route('admin.purchase_orders.send_back', $purchase), ['reason' => 'Ask for a better price'])
            ->assertSessionHas('success', "{$purchase->reference_number} sent back to draft.");
        $this->assertSame(Purchase::STATUS_DRAFT, $purchase->refresh()->status);
        $this->assertSame('Ask for a better price', $purchase->review_note);

        // A draft cannot be sent back again.
        $this->withServerVariables($adminHost)->actingAs($admin)
            ->post(route('admin.purchase_orders.send_back', $purchase), ['reason' => 'Again'])
            ->assertSessionHas('error');
    }

    #[Test]
    public function sending_back_returns_it_to_draft_with_the_reason_and_it_can_change_again(): void
    {
        $buyer = $this->user('procurement');
        $purchase = $this->submitted($buyer);

        // Only a draft can change.
        $this->as($buyer)->put(route('procurement.purchase_orders.update', $purchase), $this->payload([
            ['item_variant_id' => $this->variant()->id, 'quantity' => 1, 'unit_price' => 1],
        ]))->assertSessionHas('error');

        $this->as($this->user('procurement'))->post(route('procurement.purchase_orders.send_back', $purchase), ['reason' => 'Price too high, ask for 5% off'])
            ->assertSessionHas('success');

        $purchase->refresh();
        $this->assertSame(Purchase::STATUS_DRAFT, $purchase->status);
        $this->assertSame('Price too high, ask for 5% off', $purchase->review_note);
        $this->assertNull($purchase->submitted_by);

        $other = $this->variant();
        $this->as($buyer)->put(route('procurement.purchase_orders.update', $purchase), $this->payload([
            ['item_variant_id' => $other->id, 'quantity' => 20, 'unit_price' => 47.5],
        ]))->assertSessionHas('success');

        $purchase->refresh()->load('lines');
        $this->assertSame([$other->id], $purchase->lines->pluck('item_variant_id')->map(fn ($id) => (int) $id)->all());
        $this->assertSame('950.00', $purchase->subtotal_foreign);
    }

    #[Test]
    public function an_approved_order_is_placed_then_closed_only_after_goods_arrive(): void
    {
        $buyer = $this->user('procurement');
        $purchase = $this->submitted($buyer);
        $this->as($this->user('procurement'))->post(route('procurement.purchase_orders.approve', $purchase));

        $this->as($buyer)->post(route('procurement.purchase_orders.close', $purchase))->assertSessionHas('error');

        $this->as($buyer)->post(route('procurement.purchase_orders.ordered', $purchase), ['ordered_at' => now()->subDay()->toDateString()])
            ->assertSessionHas('success');

        $purchase->refresh();
        $this->assertSame(Purchase::STATUS_ORDERED, $purchase->status);
        $this->assertSame($buyer->id, (int) $purchase->ordered_by);
        $this->assertTrue($purchase->purchased_at->isYesterday());

        // P3 receiving will set these; here the line arrives in part by hand.
        $purchase->lines()->update(['received_quantity' => 4]);
        $purchase->update(['status' => Purchase::STATUS_PARTIALLY_RECEIVED]);

        $this->as($buyer)->post(route('procurement.purchase_orders.cancel', $purchase), ['reason' => 'Too late'])
            ->assertSessionHas('error');

        $this->as($buyer)->post(route('procurement.purchase_orders.close', $purchase))->assertSessionHas('success');
        $this->assertSame(Purchase::STATUS_CLOSED, $purchase->refresh()->status);
    }

    #[Test]
    public function an_order_is_cancelled_with_a_reason_before_anything_arrives(): void
    {
        $buyer = $this->user('procurement');
        $purchase = $this->draft($buyer);

        $this->as($buyer)->post(route('procurement.purchase_orders.cancel', $purchase), ['reason' => ''])
            ->assertSessionHasErrors('reason');

        $this->as($buyer)->post(route('procurement.purchase_orders.cancel', $purchase), ['reason' => 'Supplier out of stock'])
            ->assertSessionHas('success');

        $purchase->refresh();
        $this->assertSame(Purchase::STATUS_CANCELLED, $purchase->status);
        $this->assertSame($buyer->id, (int) $purchase->cancelled_by);
    }

    #[Test]
    public function steps_happen_in_order(): void
    {
        $buyer = $this->user('procurement');
        $purchase = $this->draft($buyer);
        $approver = $this->user('procurement');

        $this->as($approver)->post(route('procurement.purchase_orders.approve', $purchase))
            ->assertSessionHas('error', 'This order is not waiting for approval.');
        $this->as($buyer)->post(route('procurement.purchase_orders.ordered', $purchase))
            ->assertSessionHas('error');

        $this->assertSame(Purchase::STATUS_DRAFT, $purchase->refresh()->status);
    }

    #[Test]
    public function the_pages_show_the_orders_and_what_the_viewer_may_do(): void
    {
        $buyer = $this->user('procurement');
        $purchase = $this->submitted($buyer);
        $approver = $this->user('procurement');

        $this->as($buyer)->get(route('procurement.purchase_orders.show', $purchase))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/PurchaseOrders/Show')
                ->where('order.reference_number', $purchase->reference_number)
                ->where('order.can.review', false)
                ->where('order.lines.0.quantity', 10));

        $this->as($approver)->get(route('procurement.purchase_orders.show', $purchase))
            ->assertInertia(fn ($page) => $page->where('order.can.review', true));

        $this->as($approver)->get(route('procurement.dashboard'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/Dashboard/index')
                ->where('stats.awaiting_approval', 1)
                ->where('forMe.0.id', $purchase->id));

        $this->as($buyer)->get(route('procurement.purchase_orders.index', ['status' => 'submitted']))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/PurchaseOrders/Index')
                ->where('counts.submitted', 1)
                ->where('orders.0.id', $purchase->id));

        $this->as($buyer)->get(route('procurement.purchase_orders.create'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/PurchaseOrders/Form')->where('suppliers.0.id', $this->supplier->id));

        // A submitted order is not a draft any more: edit sends you back to it.
        $this->as($buyer)->get(route('procurement.purchase_orders.edit', $purchase))
            ->assertRedirect(route('procurement.purchase_orders.show', $purchase));

        $draft = $this->draft($buyer);
        $this->as($buyer)->get(route('procurement.purchase_orders.edit', $draft))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/PurchaseOrders/Form')
                ->where('order.id', $draft->id)
                ->where('preselectedSupplier', null)
                ->where('suppliers.0.id', $this->supplier->id));
    }

    #[Test]
    public function the_line_picker_finds_skus(): void
    {
        $item = Item::factory()->create(['product_name' => 'Thermos flask', 'status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);
        $this->variant();

        $this->as($this->user('procurement'))->getJson(route('procurement.purchase_orders.variants', ['q' => 'thermos']))
            ->assertOk()
            ->assertJsonCount(1, 'variants')
            ->assertJsonPath('variants.0.id', $variant->id);
    }

    #[Test]
    public function other_roles_cannot_open_procurement(): void
    {
        $this->as($this->user('seller'))->get(route('procurement.purchase_orders.index'))->assertForbidden();
    }
}
