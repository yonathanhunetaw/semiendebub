<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Exceptions\PurchaseOrderException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\PurchaseOrderReasonRequest;
use App\Http\Requests\Procurement\SetApprovalLimitRequest;
use App\Models\Procurement\Purchase;
use App\Services\Admin\ActiveStore;
use App\Services\Procurement\PurchaseOrderPresenter;
use App\Services\Procurement\PurchaseOrderService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Purchase orders waiting for approval, in the admin app. An admin who signs
 * in on procurement.* is sent home to admin.*, so the orders that need a
 * global admin (at or above the limit) are approved here.
 */
class PurchaseOrderApprovalController extends Controller
{
    public function __construct(private readonly PurchaseOrderService $orders)
    {
    }

    public function index(Request $request, ActiveStore $activeStore): Response
    {
        $user = $request->user();

        $submitted = Purchase::query()
            ->where('status', Purchase::STATUS_SUBMITTED)
            ->orderBy('submitted_at')
            ->get();

        return Inertia::render('Admin/PurchaseOrders/Index', [
            'orders' => $submitted->map(fn (Purchase $p) => PurchaseOrderPresenter::detail($p, $user))->values()->all(),
            'adminLimit' => PurchaseOrderService::adminLimit(),
            'canSetLimit' => $activeStore->isGlobal(),
        ]);
    }

    public function setLimit(SetApprovalLimitRequest $request): RedirectResponse
    {
        PurchaseOrderService::setAdminLimit((float) $request->validated('limit'), $request->user());

        return back()->with('success', 'From ETB '.number_format(PurchaseOrderService::adminLimit()).' only a global admin approves purchase orders.');
    }

    public function approve(Request $request, Purchase $purchase): RedirectResponse
    {
        try {
            $purchase = $this->orders->approve($purchase, $request->user());
        } catch (PurchaseOrderException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$purchase->reference_number} approved.");
    }

    public function sendBack(PurchaseOrderReasonRequest $request, Purchase $purchase): RedirectResponse
    {
        try {
            $purchase = $this->orders->sendBack($purchase, $request->user(), (string) $request->validated('reason'));
        } catch (PurchaseOrderException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$purchase->reference_number} sent back to draft.");
    }
}
