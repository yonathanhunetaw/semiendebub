<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Exceptions\PurchaseOrderException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\RecordSupplierPaymentRequest;
use App\Models\Procurement\PayableInstallment;
use App\Models\Procurement\Purchase;
use App\Services\Procurement\SupplierPaymentService;
use Illuminate\Http\RedirectResponse;

/**
 * Procurement records a payment it made to the supplier; finance or a global
 * admin confirms it.
 */
class SupplierPaymentController extends Controller
{
    public function store(RecordSupplierPaymentRequest $request, Purchase $purchase, SupplierPaymentService $payments): RedirectResponse
    {
        $payable = $purchase->payable()->first();

        if ($payable === null) {
            return back()->with('error', 'Pay an order only once it is approved.');
        }

        $installment = PayableInstallment::query()
            ->where('supplier_payable_id', $payable->id)
            ->findOrFail($request->integer('payable_installment_id'));

        try {
            $payment = $payments->record($installment, $request->validated(), $request->user());
        } catch (PurchaseOrderException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', sprintf(
            '%s %s recorded on %s. Finance or a global admin confirms it.',
            $payment->currency,
            number_format((float) $payment->amount, 2),
            $installment->label,
        ));
    }
}
