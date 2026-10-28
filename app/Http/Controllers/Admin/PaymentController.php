<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Models\Finance\Payment;
use App\Services\Admin\ActiveStore;
use App\Services\Finance\PaymentBoard;
use App\Services\Finance\PaymentService;
use App\Services\Workforce\DayBook;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\TimeFilter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every payment part, newest first, with today's confirmed takings by method.
 * Parts still waiting on their account's owner are listed with their status
 * but not counted as taken.
 *
 * Above them, the parts this admin may be the second person on. Admins work in
 * the admin app (signing in on the seller app sends them back here), so this is
 * where they confirm cash a store manager took themselves, which no one else in
 * a one-manager store can. The rules are PaymentService's, as in the seller inbox.
 */
class PaymentController extends Controller
{
    public function index(Request $request, ActiveStore $activeStore, PaymentBoard $board, TimeFilter $time, DayBook $days): Response
    {
        $method = $request->string('method')->toString() ?: null;
        $period = $time->fromRequest($request);
        // The takings box follows the chosen period. With none chosen it is everything taken on today's
        // calendar date, so cash taken while the store was closed is never left out of sight.
        $summaryPeriod = $period;

        // When a payment was taken, and in which store (its order's, else its customer's).
        $paidAt = DB::raw('COALESCE(payments.paid_at, payments.created_at)');
        $storeOf = DB::raw('COALESCE((select store_id from sales where sales.id = payments.sale_id), (select store_id from customers where customers.id = payments.customer_id))');

        // A payment's store is its order's; a credit repayment has no order,
        // so it is its customer's.
        $scoped = fn () => $activeStore->scopeIds() === null
            ? Payment::query()
            : Payment::query()->where(fn ($q) => $q
                ->where(fn ($sale) => $activeStore->applyThrough($sale->whereNotNull('sale_id'), 'sale'))
                ->orWhere(fn ($repayment) => $activeStore->applyThrough($repayment->whereNull('sale_id'), 'customer')));

        $paginator = $scoped()
            ->with(['sale.store', 'user', 'account.owner', 'customer:id,store_id'])
            ->when($method, fn ($q, string $m) => $q->where('payment_method', $m))
            // Parts still waiting on confirmation are always listed; the period narrows the settled ones.
            ->tap(fn ($q) => $time->applyKeepingOpen($q, $paidAt, $storeOf, $activeStore->scopeIds(), $period,
                fn ($open) => $open->whereIn('payments.status', [Payment::STATUS_PENDING, Payment::STATUS_CLAIMED])))
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('Admin/Payments/Index', [
            'to_confirm' => $board->inbox($request->user(), $activeStore->scopeIds()),
            'payments' => collect($paginator->items())->map(fn (Payment $p): array => [
                'id' => (int) $p->id,
                'order' => $p->sale?->reference_number,
                'store' => $p->sale?->store?->name,
                'method' => (string) $p->payment_method,
                'account' => $p->account?->label(),
                'owner' => $p->account?->owner ? trim($p->account->owner->first_name.' '.$p->account->owner->last_name) : null,
                'status' => (string) $p->status,
                'amount' => (float) $p->amount,
                'currency' => (string) ($p->currency ?? 'ETB'),
                'reference' => $p->transaction_reference,
                'taken_by' => $p->user ? trim($p->user->first_name.' '.$p->user->last_name) : null,
                'paid_at' => ($p->paid_at ?? $p->created_at)?->toIso8601String(),
                'open' => in_array($p->status, [Payment::STATUS_PENDING, Payment::STATUS_CLAIMED], true),
                'day' => $days->tag(($p->sale?->store_id ?? $p->customer?->store_id) !== null ? (int) ($p->sale?->store_id ?? $p->customer?->store_id) : null, $p->paid_at ?? $p->created_at),
            ])->values(),
            'today' => $scoped()
                ->confirmed()
                ->tap(fn ($q) => $period['when'] === 'all'
                    ? $q->where($paidAt, '>=', LocalTime::startOf(LocalTime::today()))->where($paidAt, '<', LocalTime::startOf(LocalTime::today()->addDay()))
                    : $time->apply($q, $paidAt, $storeOf, $activeStore->scopeIds(), $summaryPeriod))
                ->selectRaw('payment_method, SUM(amount) as total, COUNT(*) as n')
                ->groupBy('payment_method')
                ->get()
                ->map(fn ($row): array => ['method' => (string) $row->payment_method, 'total' => (float) $row->total, 'count' => (int) $row->n])
                ->values(),
            'methods' => Payment::query()->distinct()->orderBy('payment_method')->pluck('payment_method'),
            'summary_label' => $period['when'] === 'all' ? 'Today' : (TimeFilter::LABELS[$period['when']] ?? 'Today'),
            'time' => $time->describe($period),
            'filters' => ['method' => $method, 'when' => $period['when']],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
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
}
