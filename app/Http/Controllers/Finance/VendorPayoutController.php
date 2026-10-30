<?php

declare(strict_types=1);

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Vendor\VendorMoney;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Finance → Vendor payouts: what Duka owes each vendor's store, and payouts to
 * record or confirm. Finance is the usual second person for a payout a global
 * admin recorded (and the other way round). The writes are VendorMoneyController's.
 */
class VendorPayoutController extends Controller
{
    public function __construct(private readonly VendorMoney $money)
    {
    }

    public function index(Request $request): Response
    {
        abort_unless($this->money->mayHandleMoney($request->user()), 403);

        return Inertia::render('Finance/VendorPayouts/Index', $this->money->board($request->user()));
    }
}
