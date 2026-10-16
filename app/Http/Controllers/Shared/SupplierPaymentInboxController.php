<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Exceptions\PurchaseOrderException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\PurchaseOrderReasonRequest;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\SupplierPayment;
use App\Services\Procurement\PurchaseOrderPresenter;
use App\Services\Procurement\SupplierPaymentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Supplier payments waiting for their second person. The same inbox on the
 * admin app (global admins) and the finance app: each renders its own page
 * so it sits in that app's layout.
 */
class SupplierPaymentInboxController extends Controller
{
    public function index(Request $request): Response
    {
        $app = $this->app($request);
        $user = $request->user();

        $waiting = SupplierPayment::query()
            ->where('status', SupplierPayment::STATUS_CLAIMED)
            ->with(['installment', 'claimer', 'account', 'supplierPayable.payable', 'supplierPayable.supplier'])
            ->orderBy('claimed_at')
            ->get();

        $recent = SupplierPayment::query()
            ->whereIn('status', [SupplierPayment::STATUS_CONFIRMED, SupplierPayment::STATUS_REJECTED])
            ->with(['installment', 'claimer', 'confirmer', 'rejecter', 'account', 'supplierPayable.payable', 'supplierPayable.supplier'])
            ->latest('updated_at')
            ->limit(15)
            ->get();

        $shape = fn (SupplierPayment $p) => PurchaseOrderPresenter::payment($p, $user) + [
            'supplier' => $p->supplierPayable?->supplier?->name,
            'reference_number' => $p->supplierPayable?->payable instanceof Purchase ? $p->supplierPayable->payable->reference_number : null,
        ];

        return Inertia::render($app === 'finance' ? 'Finance/SupplierPayments/Index' : 'Admin/SupplierPayments/Index', [
            'waiting' => $waiting->map($shape)->values()->all(),
            'recent' => $recent->map($shape)->values()->all(),
            'routePrefix' => "{$app}.supplier_payments",
        ]);
    }

    public function confirm(Request $request, SupplierPayment $payment, SupplierPaymentService $payments): RedirectResponse
    {
        try {
            $payments->confirm($payment, $request->user());
        } catch (PurchaseOrderException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Payment confirmed: it now counts as paid.');
    }

    public function reject(PurchaseOrderReasonRequest $request, SupplierPayment $payment, SupplierPaymentService $payments): RedirectResponse
    {
        try {
            $payments->reject($payment, $request->user(), (string) $request->validated('reason'));
        } catch (PurchaseOrderException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Payment rejected: it does not count.');
    }

    private function app(Request $request): string
    {
        return str_starts_with((string) $request->route()?->getName(), 'finance.') ? 'finance' : 'admin';
    }
}
