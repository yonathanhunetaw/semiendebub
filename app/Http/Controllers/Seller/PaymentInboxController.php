<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Models\Finance\Payment;
use App\Models\Finance\Remittance;
use App\Services\Finance\PaymentBoard;
use App\Services\Finance\PaymentService;
use App\Services\Finance\RemittanceService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The account owner's inbox: parts a customer says they paid into one of
 * this seller's accounts, deposits expected there that nobody has marked
 * paid yet, and handovers other sellers sent to a settlement account they
 * own. The owner checks the account and confirms, or answers "not received
 * yet".
 */
class PaymentInboxController extends Controller
{
    public function index(Request $request, PaymentBoard $board): Response
    {
        return Inertia::render('Seller/Payments/Inbox', [
            'payments' => $board->inbox($request->user()),
            // Deposits into this owner's accounts not marked paid yet: they
            // may confirm one the moment it shows in the account.
            'expected' => $board->expectedInbox($request->user()),
            'handovers' => $board->handoverInbox((int) $request->user()->id),
            // Deposits into this owner's accounts that they recorded or claimed
            // themselves: someone else confirms those (two people), shown so
            // the owner knows where they are.
            'waiting_on_others' => $board->waitingOnOthers($request->user()),
        ]);
    }

    public function confirm(Request $request, Payment $payment, PaymentService $payments): RedirectResponse
    {
        try {
            $payments->confirm($payment, $request->user());
        } catch (PaymentException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Payment confirmed.');
    }

    public function reject(Request $request, Payment $payment, PaymentService $payments): RedirectResponse
    {
        try {
            $payments->reject($payment, $request->user());
        } catch (PaymentException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Marked as not received yet. The seller will see it on the order.');
    }

    public function confirmHandover(Request $request, Remittance $remittance, RemittanceService $remittances): RedirectResponse
    {
        try {
            $remittances->confirm($remittance, $request->user());
        } catch (PaymentException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Handover confirmed. It is off the seller\'s balance.');
    }

    public function rejectHandover(Request $request, Remittance $remittance, RemittanceService $remittances): RedirectResponse
    {
        try {
            $remittances->reject($remittance, $request->user());
        } catch (PaymentException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Marked as not received. It stays on the seller\'s balance.');
    }
}
