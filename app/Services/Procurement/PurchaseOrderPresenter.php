<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Models\Auth\User;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\PurchaseLine;
use App\Exceptions\PurchaseOrderException;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\SupplierPayment;

/**
 * The shapes the procurement pages receive (types/procurement.ts).
 */
class PurchaseOrderPresenter
{
    /** @return array<string, mixed> */
    public static function supplier(Supplier $supplier): array
    {
        return [
            'id' => (int) $supplier->id,
            'name' => (string) $supplier->name,
            'country' => $supplier->country,
            'city' => $supplier->city,
            'currency' => (string) $supplier->currency,
            'phone' => $supplier->phone,
            'email' => $supplier->email,
            'address' => $supplier->address,
            'contacts' => array_values($supplier->contacts ?? []),
            'default_payment_terms' => (string) $supplier->default_payment_terms,
            'default_payment_days' => $supplier->default_payment_days,
            'notes' => $supplier->notes,
            'is_active' => (bool) $supplier->is_active,
            'orders_count' => isset($supplier->purchases_count) ? (int) $supplier->purchases_count : null,
            'open_orders_count' => isset($supplier->open_purchases_count) ? (int) $supplier->open_purchases_count : null,
        ];
    }

    /** One row of the order list. @return array<string, mixed> */
    public static function summary(Purchase $purchase): array
    {
        return [
            'id' => (int) $purchase->id,
            'reference_number' => (string) $purchase->reference_number,
            'status' => (string) $purchase->status,
            'supplier' => $purchase->supplier?->name ?? $purchase->supplier_name,
            'supplier_country' => $purchase->supplier?->country,
            'currency' => (string) $purchase->currency,
            'exchange_rate' => (float) $purchase->exchange_rate,
            'subtotal_foreign' => (float) $purchase->subtotal_foreign,
            'total_amount' => (float) $purchase->total_amount,
            'lines_count' => isset($purchase->lines_count) ? (int) $purchase->lines_count : null,
            'raised_by' => self::name($purchase->user),
            'needs_admin' => PurchaseOrderService::needsAdmin($purchase),
            'expected_at' => $purchase->expected_at?->toIso8601String(),
            'purchased_at' => $purchase->purchased_at?->toIso8601String(),
            'created_at' => $purchase->created_at?->toIso8601String(),
        ];
    }

    /** The full order, with what $viewer may do next. @return array<string, mixed> */
    public static function detail(Purchase $purchase, User $viewer): array
    {
        $purchase->loadMissing(['supplier', 'warehouse', 'lines.variant.item', 'lines.variant.itemColor', 'lines.variant.itemSize', 'lines.variant.itemPackagingType', 'user', 'submitter', 'approver', 'orderer', 'canceller']);

        $refusal = $purchase->status === Purchase::STATUS_SUBMITTED
            ? PurchaseOrderService::reviewRefusal($purchase, $viewer)
            : null;

        return self::summary($purchase) + [
            'supplier_id' => $purchase->supplier_id !== null ? (int) $purchase->supplier_id : null,
            'payment_terms' => (string) $purchase->payment_terms,
            'payment_days' => $purchase->payment_days,
            'payment_anchor' => $purchase->payment_anchor,
            'payment_schedule' => array_values($purchase->payment_schedule ?? []),
            'money' => self::money($purchase, $viewer),
            'incoterm' => $purchase->incoterm,
            'warehouse_id' => $purchase->warehouse_id !== null ? (int) $purchase->warehouse_id : null,
            'warehouse' => $purchase->warehouse?->name,
            'notes' => $purchase->notes,
            'review_note' => $purchase->review_note,
            'cancel_reason' => $purchase->cancel_reason,
            'total_cbm' => round((float) $purchase->lines->sum('cbm'), 4),
            'total_weight_kg' => round((float) $purchase->lines->sum('weight_kg'), 3),
            'lines' => $purchase->lines->map(fn (PurchaseLine $line) => self::line($line))->values()->all(),
            'steps' => [
                ['key' => 'raised', 'label' => 'Raised', 'at' => $purchase->created_at?->toIso8601String(), 'by' => self::name($purchase->user)],
                ['key' => 'submitted', 'label' => 'Submitted', 'at' => $purchase->submitted_at?->toIso8601String(), 'by' => self::name($purchase->submitter)],
                ['key' => 'approved', 'label' => 'Approved', 'at' => $purchase->approved_at?->toIso8601String(), 'by' => self::name($purchase->approver)],
                ['key' => 'ordered', 'label' => 'Ordered', 'at' => $purchase->purchased_at?->toIso8601String(), 'by' => self::name($purchase->orderer)],
                ['key' => 'closed', 'label' => 'Closed', 'at' => $purchase->closed_at?->toIso8601String(), 'by' => null],
                ['key' => 'cancelled', 'label' => 'Cancelled', 'at' => $purchase->cancelled_at?->toIso8601String(), 'by' => self::name($purchase->canceller)],
            ],
            'can' => [
                'edit' => $purchase->isEditable(),
                'submit' => $purchase->status === Purchase::STATUS_DRAFT,
                'review' => $purchase->status === Purchase::STATUS_SUBMITTED && $refusal === null,
                'order' => $purchase->status === Purchase::STATUS_APPROVED,
                'cancel' => in_array($purchase->status, PurchaseOrderService::CANCELLABLE, true)
                    && $purchase->lines->every(fn (PurchaseLine $l) => $l->received_quantity === 0),
                'close' => in_array($purchase->status, [Purchase::STATUS_PARTIALLY_RECEIVED, Purchase::STATUS_RECEIVED], true),
            ],
            'review_refusal' => $refusal,
        ];
    }

    /**
     * The order's payable (once approved), or a preview of its schedule.
     *
     * @return array<string, mixed>
     */
    public static function money(Purchase $purchase, User $viewer): array
    {
        $payable = $purchase->payable()->with(['installments.payments.claimer', 'installments.payments.confirmer', 'installments.payments.rejecter', 'installments.payments.account'])->first();

        if ($payable === null) {
            try {
                $preview = app(PaymentScheduleBuilder::class)->forPurchase($purchase);
                $problem = null;
            } catch (PurchaseOrderException $e) {
                $preview = [];
                $problem = $e->getMessage();
            }

            return ['payable' => null, 'preview' => $preview, 'preview_problem' => $problem, 'payments' => [], 'can_pay' => false];
        }

        return [
            'payable' => app(PayablesLedger::class)->summary($payable),
            'preview' => [],
            'preview_problem' => null,
            'payments' => $payable->installments->flatMap->payments
                ->sortByDesc('id')
                ->map(fn (SupplierPayment $p) => self::payment($p, $viewer))
                ->values()->all(),
            'can_pay' => $payable->cancelled_at === null
                && in_array($purchase->status, SupplierPaymentService::PAYABLE_STATUSES, true)
                && SupplierPaymentService::mayRecord($viewer),
        ];
    }

    /** @return array<string, mixed> */
    public static function payment(SupplierPayment $payment, User $viewer): array
    {
        return [
            'id' => (int) $payment->id,
            'installment_id' => (int) $payment->payable_installment_id,
            'installment' => $payment->installment?->label,
            'currency' => (string) $payment->currency,
            'amount' => (float) $payment->amount,
            'exchange_rate' => (float) $payment->exchange_rate,
            'amount_etb' => (float) $payment->amount_etb,
            'paid_on' => $payment->paid_on?->toDateString(),
            'method' => (string) $payment->method,
            'account' => $payment->account ? trim($payment->account->account_name.' · '.$payment->account->account_number) : null,
            'reference' => $payment->reference,
            'notes' => $payment->notes,
            'status' => (string) $payment->status,
            'claimed_by' => self::name($payment->claimer),
            'claimed_at' => $payment->claimed_at?->toIso8601String(),
            'confirmed_by' => self::name($payment->confirmer),
            'confirmed_at' => $payment->confirmed_at?->toIso8601String(),
            'rejected_by' => self::name($payment->rejecter),
            'reject_reason' => $payment->reject_reason,
            'can_confirm' => $payment->status === SupplierPayment::STATUS_CLAIMED && SupplierPaymentService::mayConfirm($payment, $viewer),
        ];
    }

    /** @return array<string, mixed> */
    public static function line(PurchaseLine $line): array
    {
        return [
            'id' => (int) $line->id,
            'item_variant_id' => (int) $line->item_variant_id,
            'variant' => $line->variant ? self::variant($line->variant) : null,
            'supplier_sku' => $line->supplier_sku,
            'quantity' => (int) $line->quantity,
            'unit_price' => (float) $line->unit_price,
            'line_total' => (float) $line->line_total,
            'cbm' => $line->cbm !== null ? (float) $line->cbm : null,
            'weight_kg' => $line->weight_kg !== null ? (float) $line->weight_kg : null,
            'received_quantity' => (int) $line->received_quantity,
            'notes' => $line->notes,
        ];
    }

    /** A SKU as the order form picks it. @return array<string, mixed> */
    public static function variant(ItemVariant $variant): array
    {
        $variant->loadMissing(['item', 'itemColor', 'itemSize', 'itemPackagingType']);

        return [
            'id' => (int) $variant->id,
            'sku' => (string) $variant->sku,
            'name' => (string) ($variant->item?->product_name ?? 'Unknown product'),
            'detail' => collect([$variant->itemColor?->name, $variant->itemSize?->name])->filter()->implode(' · ') ?: null,
            'unit' => $variant->itemPackagingType?->name ?? 'Unit',
            'image_url' => $variant->image_url,
        ];
    }

    private static function name(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        return trim($user->first_name.' '.$user->last_name) ?: null;
    }
}
