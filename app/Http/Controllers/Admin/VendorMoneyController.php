<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Exceptions\VendorException;
use App\Http\Requests\Vendor\RecordVendorPayoutRequest;
use App\Http\Requests\Vendor\RejectVendorApplicationRequest;
use App\Http\Requests\Vendor\SetCommissionRequest;
use App\Models\Store\Store;
use App\Models\Vendor\VendorPayout;
use App\Services\Vendor\VendorMoney;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/** Settings → Vendors, the money part (vendor V3): the commission, and payouts with two people. */
class VendorMoneyController extends Controller
{
    public function __construct(private readonly VendorMoney $money)
    {
    }

    public function commission(SetCommissionRequest $request): RedirectResponse
    {
        return $this->attempt(fn () => $this->money->setCommission($request->user(), (float) $request->validated('commission_pct')),
            'Commission saved. It applies to orders paid from now on.');
    }

    public function record(RecordVendorPayoutRequest $request, Store $store): RedirectResponse
    {
        return $this->attempt(fn () => $this->money->recordPayout(
            $store,
            $request->user(),
            (float) $request->validated('amount'),
            (string) $request->validated('method'),
            $request->validated('reference'),
        ), 'Payout recorded. A second person confirms it before it leaves the balance.');
    }

    public function confirm(Request $request, VendorPayout $payout): RedirectResponse
    {
        return $this->attempt(fn () => $this->money->confirmPayout($payout, $request->user()), 'Payout confirmed.');
    }

    public function reject(RejectVendorApplicationRequest $request, VendorPayout $payout): RedirectResponse
    {
        return $this->attempt(fn () => $this->money->rejectPayout($payout, $request->user(), (string) $request->validated('reason')), 'Payout rejected.');
    }

    private function attempt(callable $step, string $done): RedirectResponse
    {
        try {
            $step();
        } catch (VendorException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', $done);
    }
}
