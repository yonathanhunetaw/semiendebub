<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Http\Controllers\Controller;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use App\Services\Procurement\PayablesLedger;
use App\Services\Procurement\PurchaseOrderPresenter;
use App\Services\Procurement\PurchaseOrderService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The procurement home: what waits on whom, the open order book and the
 * money owed. Containers join in later phases (P4, P6).
 */
class DashboardController extends Controller
{
    public function index(Request $request, PayablesLedger $ledger): Response
    {
        $user = $request->user();
        $orders = fn () => Purchase::query()->whereNotNull('supplier_id');

        $submitted = $orders()->where('status', Purchase::STATUS_SUBMITTED)->with(['supplier', 'user'])->orderBy('submitted_at')->get();

        return Inertia::render('Procurement/Dashboard/index', [
            'stats' => [
                'drafts' => $orders()->where('status', Purchase::STATUS_DRAFT)->count(),
                'awaiting_approval' => $submitted->count(),
                'open' => $orders()->whereIn('status', Purchase::OPEN)->count(),
                'open_value_etb' => (float) $orders()->whereIn('status', Purchase::OPEN)->sum('total_amount'),
                'suppliers' => Supplier::query()->active()->count(),
            ],
            'forMe' => $submitted
                ->filter(fn (Purchase $p) => PurchaseOrderService::mayReview($p, $user))
                ->map(fn (Purchase $p) => PurchaseOrderPresenter::summary($p))
                ->values()->all(),
            'myDrafts' => $orders()->where('status', Purchase::STATUS_DRAFT)->where('user_id', $user->id)
                ->with(['supplier', 'user'])->withCount('lines')->latest('updated_at')->limit(5)->get()
                ->map(fn (Purchase $p) => PurchaseOrderPresenter::summary($p))->all(),
            'recent' => $orders()->with(['supplier', 'user'])->withCount('lines')->latest('id')->limit(8)->get()
                ->map(fn (Purchase $p) => PurchaseOrderPresenter::summary($p))->all(),
            'money' => $ledger->totals(),
            'dueSoon' => $ledger->openInstallments()->filter(fn (array $r) => in_array($r['state'], ['overdue', 'due'], true))->take(6)->values()->all(),
            'adminLimit' => PurchaseOrderService::adminLimit(),
        ]);
    }
}
