<?php

declare(strict_types=1);

namespace Tests\Feature\Procurement;

use App\Models\Auth\User;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\PayableInstallment;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\SupplierPayment;
use App\Models\Store\Store;
use App\Services\Procurement\PayablesLedger;
use App\Services\Procurement\PaymentScheduleBuilder;
use App\Exceptions\PurchaseOrderException;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * Procurement P2: the payment schedule and paying the supplier. The schedule
 * is written when the order is approved; procurement records each payment at
 * the rate actually paid; finance or a global admin confirms it.
 */
class SupplierPaymentTest extends TestCase
{
    use RefreshDatabase;

    private Supplier $supplier;

    private User $buyer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->supplier = Supplier::factory()->create(['currency' => 'USD']);
        $this->buyer = $this->user('procurement');
    }

    private function user(string $role, array $attributes = []): User
    {
        Role::findOrCreate($role);
        $user = User::factory()->create(['role' => $role, 'email_verified_at' => now()] + $attributes);
        $user->assignRole($role);

        return $user;
    }

    private function on(string $app, User $user): self
    {
        $this->withServerVariables(['HTTP_HOST' => $app.'.'.config('app.system_domain')]);
        $this->actingAs($user);

        return $this;
    }

    /** A 1,000 USD order at 125 ETB with these terms, approved (and ordered unless told not to). */
    private function order(array $terms, bool $placed = true): Purchase
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->on('procurement', $this->buyer)->post(route('procurement.purchase_orders.store'), $terms + [
            'supplier_id' => $this->supplier->id,
            'currency' => 'USD',
            'exchange_rate' => 125,
            'lines' => [['item_variant_id' => $variant->id, 'quantity' => 10, 'unit_price' => 100]],
        ])->assertSessionHasNoErrors();

        $purchase = Purchase::query()->latest('id')->firstOrFail();
        $this->post(route('procurement.purchase_orders.submit', $purchase))->assertSessionHas('success');
        $this->on('procurement', $this->user('procurement'))->post(route('procurement.purchase_orders.approve', $purchase))->assertSessionHas('success');

        if ($placed) {
            $this->on('procurement', $this->buyer)->post(route('procurement.purchase_orders.ordered', $purchase), ['ordered_at' => '2026-10-01']);
        }

        return $purchase->refresh();
    }

    /** @return array<string, mixed> */
    private function installmentRows(Purchase $purchase): array
    {
        return app(PayablesLedger::class)->summary($purchase->payable()->firstOrFail(), CarbonImmutable::parse('2026-10-16'))['installments'];
    }

    private function pay(Purchase $purchase, int $sequence, float $amount, float $rate = 131.5, ?User $by = null): \Illuminate\Testing\TestResponse
    {
        $installment = $purchase->payable()->firstOrFail()->installments()->where('sequence', $sequence)->firstOrFail();

        return $this->on('procurement', $by ?? $this->buyer)->post(route('procurement.purchase_orders.payments.store', $purchase), [
            'payable_installment_id' => $installment->id,
            'amount' => $amount,
            'exchange_rate' => $rate,
            'paid_on' => '2026-10-02',
            'method' => 'swift',
            'reference' => 'SWIFT-123',
        ]);
    }

    #[Test]
    public function immediate_terms_are_one_payment_due_on_the_order_date(): void
    {
        $purchase = $this->order(['payment_terms' => 'immediate']);
        $rows = $this->installmentRows($purchase);

        $this->assertCount(1, $rows);
        $this->assertSame(1000.0, $rows[0]['amount']);
        $this->assertSame('2026-10-01', $rows[0]['due_on']);
        $this->assertSame('overdue', $rows[0]['state']);
    }

    #[Test]
    public function fixed_date_terms_fall_due_n_days_after_the_order_or_wait_for_shipping(): void
    {
        $afterOrder = $this->order(['payment_terms' => 'fixed_date', 'payment_days' => 90, 'payment_anchor' => 'order']);
        $row = $this->installmentRows($afterOrder)[0];
        $this->assertSame('after_order', $row['due_rule']);
        $this->assertSame('2026-12-30', $row['due_on']);
        $this->assertSame('due', $row['state']);

        $afterShipping = $this->order(['payment_terms' => 'fixed_date', 'payment_days' => 30, 'payment_anchor' => 'shipping']);
        $row = $this->installmentRows($afterShipping)[0];
        $this->assertNull($row['due_on'], 'Shipping has not happened yet.');
        $this->assertSame('waiting', $row['state']);
    }

    #[Test]
    public function installments_by_percent_add_up_to_the_total_with_rounding_on_the_last(): void
    {
        $purchase = $this->order(['payment_terms' => 'installments', 'payment_schedule' => [
            ['label' => 'Deposit', 'percent' => 33.333, 'due' => 'on_order'],
            ['label' => 'Before shipping', 'percent' => 33.333, 'due' => 'after_order', 'days' => 30],
            ['label' => 'Balance', 'percent' => 33.334, 'due' => 'after_arrival', 'days' => 0],
        ]]);

        $rows = $this->installmentRows($purchase);
        $this->assertSame([333.33, 333.33, 333.34], array_column($rows, 'amount'));
        $this->assertSame(['2026-10-01', '2026-10-31', null], array_column($rows, 'due_on'));
        $this->assertSame(['overdue', 'due', 'waiting'], array_column($rows, 'state'));
    }

    #[Test]
    public function a_schedule_that_does_not_add_up_cannot_be_submitted(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->on('procurement', $this->buyer)->post(route('procurement.purchase_orders.store'), [
            'supplier_id' => $this->supplier->id,
            'currency' => 'USD',
            'exchange_rate' => 125,
            'payment_terms' => 'installments',
            'payment_schedule' => [
                ['label' => 'Deposit', 'amount' => 300, 'due' => 'on_order'],
                ['label' => 'Balance', 'amount' => 600, 'due' => 'on_date', 'date' => '2027-01-15'],
            ],
            'lines' => [['item_variant_id' => $variant->id, 'quantity' => 10, 'unit_price' => 100]],
        ])->assertSessionHasNoErrors();

        $purchase = Purchase::query()->sole();
        $this->post(route('procurement.purchase_orders.submit', $purchase))
            ->assertSessionHas('error', 'The installments add up to USD 900.00, but the order is USD 1,000.00.');
        $this->assertSame(Purchase::STATUS_DRAFT, $purchase->refresh()->status);

        $this->expectException(PurchaseOrderException::class);
        app(PaymentScheduleBuilder::class)->build('installments', 100, null, null, [['due' => 'after_order']]);
    }

    #[Test]
    public function a_payment_is_recorded_at_the_rate_paid_and_counts_only_once_confirmed(): void
    {
        $purchase = $this->order(['payment_terms' => 'installments', 'payment_schedule' => [
            ['label' => 'Deposit', 'percent' => 30, 'due' => 'on_order'],
            ['label' => 'Balance', 'percent' => 70, 'due' => 'after_order', 'days' => 60],
        ]]);

        $this->pay($purchase, 1, 300, 131.5)->assertSessionHas('success');

        $payment = SupplierPayment::query()->sole();
        $this->assertSame(SupplierPayment::STATUS_CLAIMED, $payment->status);
        $this->assertSame('39450.00', $payment->amount_etb); // 300 × 131.5, not the order's 125
        $this->assertSame(0.0, $this->installmentRows($purchase)[0]['paid'], 'Not confirmed yet.');
        $this->assertSame(300.0, $this->installmentRows($purchase)[0]['waiting']);

        // The same money cannot be recorded twice while it waits.
        $this->pay($purchase, 1, 1)->assertSessionHas('error');

        $this->on('finance', $this->user('finance'))->post(route('finance.supplier_payments.confirm', $payment))->assertSessionHas('success');

        $rows = $this->installmentRows($purchase);
        $this->assertSame('paid', $rows[0]['state']);
        $summary = app(PayablesLedger::class)->summary($purchase->payable()->firstOrFail());
        $this->assertSame(700.0, $summary['remaining']);
        $this->assertSame(87500.0, $summary['remaining_etb_estimate']); // the unpaid part at the order's rate
        $this->assertSame(39450.0, $summary['paid_etb']);
    }

    #[Test]
    public function whoever_recorded_a_payment_cannot_confirm_it_and_only_finance_or_a_global_admin_can(): void
    {
        $globalAdmin = $this->user('admin');
        $purchase = $this->order(['payment_terms' => 'immediate']);

        // A global admin records this one, so they may not confirm it.
        $this->pay($purchase, 1, 400, 130, $globalAdmin)->assertSessionHas('success');
        $payment = SupplierPayment::query()->sole();

        $this->on('admin', $globalAdmin)->post(route('admin.supplier_payments.confirm', $payment))
            ->assertSessionHas('error', 'You recorded this payment yourself. A second person has to confirm it.');

        $this->on('admin', $this->user('admin', ['store_id' => Store::factory()->create()->id]))
            ->post(route('admin.supplier_payments.confirm', $payment))->assertForbidden();

        $this->on('procurement', $this->user('procurement'))->post(route('procurement.purchase_orders.payments.store', $purchase), [])
            ->assertSessionHasErrors('payable_installment_id');

        $this->assertSame(SupplierPayment::STATUS_CLAIMED, $payment->refresh()->status);

        $this->on('finance', $this->user('finance'))->post(route('finance.supplier_payments.reject', $payment), ['reason' => 'Not on the statement'])
            ->assertSessionHas('success');

        $payment->refresh();
        $this->assertSame(SupplierPayment::STATUS_REJECTED, $payment->status);
        $this->assertSame('Not on the statement', $payment->reject_reason);
        $this->assertSame(1000.0, $this->installmentRows($purchase)[0]['remaining']);
    }

    #[Test]
    public function an_order_is_paid_only_once_approved_and_never_more_than_is_owed(): void
    {
        $purchase = $this->order(['payment_terms' => 'immediate'], placed: false);
        $this->assertSame(Purchase::STATUS_APPROVED, $purchase->status);

        $this->pay($purchase, 1, 1000.01)->assertSessionHas('error');
        $this->pay($purchase, 1, 1000)->assertSessionHas('success');

        $this->assertSame(1, SupplierPayment::query()->count());
    }

    #[Test]
    public function cancelling_an_order_cancels_what_is_owed_but_not_while_a_payment_waits(): void
    {
        $purchase = $this->order(['payment_terms' => 'immediate']);
        $this->pay($purchase, 1, 200);

        $this->on('procurement', $this->buyer)->post(route('procurement.purchase_orders.cancel', $purchase), ['reason' => 'Supplier closed'])
            ->assertSessionHas('error', 'A payment on this order is waiting for confirmation: confirm or reject it first.');

        $this->on('admin', $this->user('admin'))->post(route('admin.supplier_payments.confirm', SupplierPayment::query()->sole()));

        $this->on('procurement', $this->buyer)->post(route('procurement.purchase_orders.cancel', $purchase), ['reason' => 'Supplier closed'])
            ->assertSessionHas('success');

        $summary = app(PayablesLedger::class)->summary($purchase->payable()->firstOrFail());
        $this->assertTrue($summary['cancelled']);
        $this->assertSame(0.0, $summary['remaining']);
        $this->assertSame(200.0, $summary['paid'], 'What was paid stays on record.');
        $this->assertSame(0.0, app(PayablesLedger::class)->totals()['owed_etb']);
    }

    #[Test]
    public function the_payables_board_and_inboxes_show_what_is_owed_and_waiting(): void
    {
        $purchase = $this->order(['payment_terms' => 'installments', 'payment_schedule' => [
            ['label' => 'Deposit', 'percent' => 50, 'due' => 'on_order'],
            ['label' => 'Balance', 'percent' => 50, 'due' => 'after_shipping', 'days' => 0],
        ]]);
        $this->pay($purchase, 1, 100);

        $this->on('procurement', $this->buyer)->get(route('procurement.payables.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Procurement/Payables/Index')
                ->has('installments', 2)
                ->where('installments.0.reference', $purchase->reference_number)
                ->where('totals.owed_etb', 125000)
                ->where('totals.waiting_count', 1));

        $this->get(route('procurement.purchase_orders.show', $purchase))
            ->assertInertia(fn ($page) => $page->where('order.money.can_pay', true)
                ->where('order.money.payable.waiting', 100)
                ->where('order.money.payments.0.can_confirm', false));

        $this->on('finance', $this->user('finance'))->get(route('finance.supplier_payments.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Finance/SupplierPayments/Index')
                ->where('waiting.0.reference_number', $purchase->reference_number)
                ->where('waiting.0.can_confirm', true));

        $this->on('admin', $this->user('admin'))->get(route('admin.supplier_payments.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/SupplierPayments/Index')->has('waiting', 1));
    }

    #[Test]
    public function a_draft_shows_a_preview_of_its_schedule(): void
    {
        $item = Item::factory()->create(['status' => 'active']);
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->on('procurement', $this->buyer)->post(route('procurement.purchase_orders.store'), [
            'supplier_id' => $this->supplier->id,
            'currency' => 'USD',
            'exchange_rate' => 125,
            'payment_terms' => 'installments',
            'payment_schedule' => [['percent' => 40, 'due' => 'on_order'], ['percent' => 60, 'due' => 'after_order', 'days' => 45]],
            'lines' => [['item_variant_id' => $variant->id, 'quantity' => 2, 'unit_price' => 50]],
        ]);

        $this->get(route('procurement.purchase_orders.show', Purchase::query()->sole()))
            ->assertInertia(fn ($page) => $page->where('order.money.payable', null)
                ->where('order.money.preview.0.label', 'Deposit')
                ->where('order.money.preview.1.amount', 60)
                ->where('order.money.preview.1.due_rule', PayableInstallment::DUE_AFTER_ORDER));
    }
}
