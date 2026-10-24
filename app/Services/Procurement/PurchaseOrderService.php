<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\PurchaseOrderException;
use App\Models\Auth\User;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\SupplierPayable;
use App\Models\Procurement\SupplierPayment;
use Illuminate\Support\Facades\DB;

/**
 * The only place a purchase order's status changes.
 *
 *   draft ──submit──▶ submitted ──approve──▶ approved ──order──▶ ordered
 *     ▲                   │                                       │
 *     └─────send back─────┘          (P3 receiving) partially_received / received ──close──▶ closed
 *
 *   cancel: from draft, submitted, approved or ordered, while nothing has arrived.
 *
 * Two people: whoever raised or submitted an order never approves it. Below
 * the approval limit another procurement user may approve; at or above it
 * only a global admin (orders are central, they belong to no store).
 *
 * Money: the payment schedule is checked on submit and written as the order's
 * payable when it is approved (SupplierPaymentService pays it).
 */
class PurchaseOrderService
{
    public function __construct(private readonly PaymentScheduleBuilder $schedules)
    {
    }

    /** Statuses an order may still be cancelled from. */
    public const CANCELLABLE = [
        Purchase::STATUS_DRAFT,
        Purchase::STATUS_SUBMITTED,
        Purchase::STATUS_APPROVED,
        Purchase::STATUS_ORDERED,
    ];

    /**
     * A new draft.
     *
     * @param  array{supplier_id: int, currency?: string|null, exchange_rate?: float|string|null, payment_terms?: string|null, payment_days?: int|null, incoterm?: string|null, expected_at?: string|null, warehouse_id?: int|null, notes?: string|null, lines: array<int, array<string, mixed>>}  $data
     */
    public function create(array $data, User $by): Purchase
    {
        return DB::transaction(function () use ($data, $by): Purchase {
            $supplier = Supplier::query()->findOrFail($data['supplier_id']);

            $purchase = new Purchase([
                'reference_number' => $this->nextReference(),
                'status' => Purchase::STATUS_DRAFT,
                'user_id' => $by->id,
                'store_id' => null,
            ]);

            $this->fill($purchase, $supplier, $data);
            $purchase->save();
            $this->writeLines($purchase, $data['lines']);

            return $this->fresh($purchase);
        });
    }

    /**
     * Change a draft: header and every line (the lines sent replace the old ones).
     *
     * @param  array<string, mixed>  $data  as for create()
     */
    public function update(Purchase $purchase, array $data, User $by): Purchase
    {
        return DB::transaction(function () use ($purchase, $data): Purchase {
            $purchase = $this->lock($purchase);

            if (! $purchase->isEditable()) {
                throw new PurchaseOrderException('Only a draft can be changed. Ask the approver to send it back first.');
            }

            $supplier = Supplier::query()->findOrFail($data['supplier_id']);
            $this->fill($purchase, $supplier, $data);
            $purchase->save();

            $purchase->lines()->delete();
            $this->writeLines($purchase, $data['lines']);

            return $this->fresh($purchase);
        });
    }

    /** Draft → submitted: ready for a second person to approve. */
    public function submit(Purchase $purchase, User $by): Purchase
    {
        return DB::transaction(function () use ($purchase, $by): Purchase {
            $purchase = $this->lock($purchase);
            $this->expect($purchase, [Purchase::STATUS_DRAFT], 'Only a draft can be submitted.');

            if (! $purchase->lines()->exists()) {
                throw new PurchaseOrderException('Add at least one line before submitting.');
            }

            if ((float) $purchase->exchange_rate <= 0) {
                throw new PurchaseOrderException('Set the exchange rate before submitting.');
            }

            // Throws when the installments do not add up to the order.
            $this->schedules->forPurchase($purchase);

            $purchase->forceFill([
                'status' => Purchase::STATUS_SUBMITTED,
                'submitted_at' => now(),
                'submitted_by' => $by->id,
                'review_note' => null,
            ])->save();

            return $this->fresh($purchase);
        });
    }

    /** Submitted → approved, by a second person within their limit. */
    public function approve(Purchase $purchase, User $by): Purchase
    {
        return DB::transaction(function () use ($purchase, $by): Purchase {
            $purchase = $this->lock($purchase);
            $this->expect($purchase, [Purchase::STATUS_SUBMITTED], 'This order is not waiting for approval.');
            $this->assertMayReview($purchase, $by);

            $purchase->forceFill([
                'status' => Purchase::STATUS_APPROVED,
                'approved_at' => now(),
                'approved_by' => $by->id,
            ])->save();

            $this->writePayable($purchase);

            return $this->fresh($purchase);
        });
    }

    /** Submitted → draft, with the reason, so the buyer can fix it. */
    public function sendBack(Purchase $purchase, User $by, string $reason): Purchase
    {
        return DB::transaction(function () use ($purchase, $by, $reason): Purchase {
            $purchase = $this->lock($purchase);
            $this->expect($purchase, [Purchase::STATUS_SUBMITTED], 'This order is not waiting for approval.');
            $this->assertMayReview($purchase, $by);

            $purchase->forceFill([
                'status' => Purchase::STATUS_DRAFT,
                'submitted_at' => null,
                'submitted_by' => null,
                'review_note' => $reason,
            ])->save();

            return $this->fresh($purchase);
        });
    }

    /** Approved → ordered: the order went to the supplier. */
    public function markOrdered(Purchase $purchase, User $by, ?string $orderedAt = null): Purchase
    {
        return DB::transaction(function () use ($purchase, $by, $orderedAt): Purchase {
            $purchase = $this->lock($purchase);
            $this->expect($purchase, [Purchase::STATUS_APPROVED], 'Only an approved order can be placed with the supplier.');

            $purchase->forceFill([
                'status' => Purchase::STATUS_ORDERED,
                'purchased_at' => $orderedAt !== null ? $orderedAt : now(),
                'ordered_by' => $by->id,
            ])->save();

            return $this->fresh($purchase);
        });
    }

    /** Stop an order nothing of which has arrived. */
    public function cancel(Purchase $purchase, User $by, string $reason): Purchase
    {
        return DB::transaction(function () use ($purchase, $by, $reason): Purchase {
            $purchase = $this->lock($purchase);
            $this->expect($purchase, self::CANCELLABLE, 'Goods already arrived on this order: close it instead.');

            if ($purchase->lines()->where('received_quantity', '>', 0)->exists()) {
                throw new PurchaseOrderException('Goods already arrived on this order: close it instead.');
            }

            $payable = $purchase->payable()->first();

            if ($payable !== null && $payable->payments()->where('status', SupplierPayment::STATUS_CLAIMED)->exists()) {
                throw new PurchaseOrderException('A payment on this order is waiting for confirmation: confirm or reject it first.');
            }

            $payable?->forceFill(['cancelled_at' => now()])->save();

            $purchase->forceFill([
                'status' => Purchase::STATUS_CANCELLED,
                'cancelled_at' => now(),
                'cancelled_by' => $by->id,
                'cancel_reason' => $reason,
            ])->save();

            return $this->fresh($purchase);
        });
    }

    /** Finished: everything arrived, or the rest will never come. */
    public function close(Purchase $purchase, User $by): Purchase
    {
        return DB::transaction(function () use ($purchase): Purchase {
            $purchase = $this->lock($purchase);
            $this->expect(
                $purchase,
                [Purchase::STATUS_PARTIALLY_RECEIVED, Purchase::STATUS_RECEIVED],
                'Only an order that has received goods can be closed.',
            );

            $purchase->forceFill([
                'status' => Purchase::STATUS_CLOSED,
                'closed_at' => now(),
            ])->save();

            return $this->fresh($purchase);
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Who may do what
    |--------------------------------------------------------------------------
    */

    /** The ETB value at or above which only a global admin approves. */
    public static function adminLimit(): float
    {
        return (float) config('procurement.admin_approval_etb', 500000);
    }

    /** Does this order need a global admin to approve it? */
    public static function needsAdmin(Purchase $purchase): bool
    {
        return (float) $purchase->total_amount >= self::adminLimit();
    }

    /** Why $by may not approve or send back $purchase, or null when they may. */
    public static function reviewRefusal(Purchase $purchase, User $by): ?string
    {
        $id = (int) $by->id;

        if ($id === (int) $purchase->user_id || $id === (int) $purchase->submitted_by) {
            return 'You raised or submitted this order. A second person has to approve it.';
        }

        // A global admin, or a store admin with Purchase orders ticked on (AdminAreas).
        $globalAdmin = app(\App\Services\Admin\AdminAreas::class)->allows($by, 'purchase_orders');

        if ($globalAdmin) {
            return null;
        }

        if (self::needsAdmin($purchase)) {
            return 'Orders of ETB '.number_format(self::adminLimit()).' or more need a global admin to approve them (Admin → Purchase Orders).';
        }

        return $by->isRole('procurement') ? null : 'Only procurement or a global admin can approve orders.';
    }

    public static function mayReview(Purchase $purchase, User $by): bool
    {
        return $purchase->status === Purchase::STATUS_SUBMITTED && self::reviewRefusal($purchase, $by) === null;
    }

    /*
    |--------------------------------------------------------------------------
    | Internals
    |--------------------------------------------------------------------------
    */

    private function assertMayReview(Purchase $purchase, User $by): void
    {
        $refusal = self::reviewRefusal($purchase, $by);

        if ($refusal !== null) {
            throw new PurchaseOrderException($refusal, 403);
        }
    }

    /** @param  array<int, string>  $statuses */
    private function expect(Purchase $purchase, array $statuses, string $message): void
    {
        if (! in_array($purchase->status, $statuses, true)) {
            throw new PurchaseOrderException($message);
        }
    }

    /** @param  array<string, mixed>  $data */
    private function fill(Purchase $purchase, Supplier $supplier, array $data): void
    {
        $home = (string) config('procurement.home_currency', 'ETB');
        $currency = strtoupper((string) ($data['currency'] ?? $supplier->currency ?? $home));

        $purchase->fill([
            'supplier_id' => $supplier->id,
            'supplier_name' => $supplier->name,
            'currency' => $currency,
            'exchange_rate' => $currency === $home ? 1 : (float) ($data['exchange_rate'] ?? 0),
            'payment_terms' => $data['payment_terms'] ?? $supplier->default_payment_terms ?? 'immediate',
            'payment_days' => $data['payment_days'] ?? $supplier->default_payment_days,
            'payment_schedule' => ($data['payment_terms'] ?? null) === 'installments' ? array_values($data['payment_schedule'] ?? []) : null,
            'payment_anchor' => ($data['payment_terms'] ?? null) === 'fixed_date' ? ($data['payment_anchor'] ?? 'order') : null,
            'incoterm' => $data['incoterm'] ?? null,
            'expected_at' => $data['expected_at'] ?? null,
            'warehouse_id' => $data['warehouse_id'] ?? null,
            'notes' => $data['notes'] ?? null,
        ]);
    }

    /** The goods payable and its installments, fixed at approval. */
    private function writePayable(Purchase $purchase): void
    {
        $rows = $this->schedules->forPurchase($purchase);

        $payable = SupplierPayable::query()->create([
            'payable_type' => $purchase->getMorphClass(),
            'payable_id' => $purchase->id,
            'supplier_id' => $purchase->supplier_id,
            'kind' => SupplierPayable::KIND_GOODS,
            'description' => "Goods on {$purchase->reference_number}",
            'currency' => $purchase->currency,
            'amount' => $purchase->subtotal_foreign,
            'estimate_rate' => $purchase->exchange_rate,
        ]);

        foreach ($rows as $row) {
            $payable->installments()->create($row);
        }
    }

    /** @param  array<int, array<string, mixed>>  $lines */
    private function writeLines(Purchase $purchase, array $lines): void
    {
        $subtotal = 0.0;

        foreach ($lines as $line) {
            $quantity = (int) $line['quantity'];
            $unitPrice = (float) $line['unit_price'];
            $lineTotal = round($quantity * $unitPrice, 2);
            $subtotal += $lineTotal;

            $purchase->lines()->create([
                'item_variant_id' => (int) $line['item_variant_id'],
                'supplier_sku' => $line['supplier_sku'] ?? null,
                'quantity' => $quantity,
                'unit_price' => $unitPrice,
                'line_total' => $lineTotal,
                'cbm' => $line['cbm'] ?? null,
                'weight_kg' => $line['weight_kg'] ?? null,
                'notes' => $line['notes'] ?? null,
            ]);
        }

        $subtotal = round($subtotal, 2);

        $purchase->forceFill([
            'subtotal_foreign' => $subtotal,
            'total_amount' => round($subtotal * (float) $purchase->exchange_rate, 2),
        ])->save();
    }

    /** PO-2026-0001, counting per year. */
    private function nextReference(): string
    {
        $prefix = 'PO-'.now()->format('Y').'-';
        $n = Purchase::query()->where('reference_number', 'like', $prefix.'%')->count();

        do {
            $reference = $prefix.str_pad((string) ++$n, 4, '0', STR_PAD_LEFT);
        } while (Purchase::query()->where('reference_number', $reference)->exists());

        return $reference;
    }

    private function lock(Purchase $purchase): Purchase
    {
        return Purchase::query()->lockForUpdate()->findOrFail($purchase->id);
    }

    private function fresh(Purchase $purchase): Purchase
    {
        return $purchase->fresh(['supplier', 'lines.variant']) ?? $purchase;
    }
}
