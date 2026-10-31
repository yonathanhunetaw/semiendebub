<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

use App\Models\Finance\Expense;
use App\Models\Finance\Payment;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;
use App\Models\Workforce\SiteDay;
use App\Services\Finance\CustomerCreditService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;

/**
 * Does the simulated week add up? Reads only. Each check lands in the report
 * as ✅ or ❌ with the figures behind it. Only days already over are judged:
 * today may still be playing live.
 */
final class SimChecks
{
    public function __construct(private readonly SimCast $cast, private readonly CustomerCreditService $credit, private readonly Sites $sites)
    {
    }

    public function run(SimReport $report, int $days = 7): void
    {
        $today = LocalTime::today();
        $from = LocalTime::startOf($today->subDays($days - 1));
        $to = LocalTime::startOf($today);
        $sellers = collect($this->cast->people)->pluck('id')->all();
        $sales = fn () => Sale::query()->where('sales.store_id', $this->cast->store->id)->whereIn('sales.seller_id', $sellers)
            ->where('sales.created_at', '>=', $from)->where('sales.created_at', '<', $to);

        // 1. About 100,000 birr a day, on the days the shop opened.
        $perDay = $sales()->where('fulfillment_stage', '!=', Sale::STAGE_CANCELLED)->get(['total_amount', 'created_at'])
            ->groupBy(fn (Sale $sale): string => LocalTime::dateOf($sale->created_at))
            ->map(fn ($day): float => round((float) $day->sum('total_amount'), 2));
        $off = $perDay->filter(fn (float $total): bool => $total < 85_000 || $total > 115_000);
        $report->check($perDay->isNotEmpty() && $off->isEmpty(), 'Each open day sold 85,000–115,000 birr',
            $perDay->map(fn (float $t, string $d): string => CarbonImmutable::parse($d)->format('D').' '.number_format($t))->join(', '));

        // 2. Nine in ten receipts to business accounts (no TIN).
        $counts = $sales()->leftJoin('customers', 'customers.id', '=', 'sales.customer_id')
            ->selectRaw('COUNT(*) AS n, SUM(customers.id IS NOT NULL AND customers.tin_number IS NULL) AS business')->first();
        $share = (int) $counts->n === 0 ? 0 : (int) $counts->business / (int) $counts->n;
        $report->check($share >= 0.85 && $share <= 0.95, 'About 90% of receipts went to business accounts', sprintf('%d of %d (%.0f%%)', $counts->business, $counts->n, $share * 100));

        // 3. Every way to pay, and every split, was used.
        $shapes = Payment::query()->whereIn('sale_id', $sales()->select('sales.id'))->where('status', '!=', Payment::STATUS_VOID)
            ->get(['sale_id', 'payment_method'])->groupBy('sale_id')
            ->map(fn ($parts): string => $parts->pluck('payment_method')->unique()->sort()->join('+'))
            ->countBy();
        $wanted = ['cash', 'bank', 'wallet', 'credit', 'bank+cash', 'bank+wallet', 'cash+credit', 'bank+cash+wallet'];
        $missing = array_diff($wanted, $shapes->keys()->all());
        $report->check($missing === [], 'Every payment method and split was used',
            $shapes->sortKeys()->map(fn (int $n, string $shape): string => "{$shape} {$n}")->join(', ').($missing === [] ? '' : '; missing: '.implode(', ', $missing)));

        // 4. Two people on every confirmed part (credit is the admin's trust, confirmed as it is given).
        $selfConfirmed = Payment::query()->where('status', Payment::STATUS_CONFIRMED)->where('payment_method', '!=', Payment::METHOD_CREDIT)
            ->whereIn('user_id', $sellers)->where('created_at', '>=', $from)->whereColumn('confirmed_by', 'claimed_by')->count();
        $report->check($selfConfirmed === 0, 'No payment was confirmed by the person who claimed it', "{$selfConfirmed} found");

        // 5. Nothing left hanging on a finished day.
        $open = $sales()->whereNotIn('fulfillment_stage', [Sale::STAGE_DELIVERED, Sale::STAGE_CANCELLED])->get(['reference_number', 'fulfillment_stage']);
        $report->check($open->isEmpty(), 'Every order of a finished day was delivered or cancelled',
            $open->isEmpty() ? '' : $open->count().' still open: '.$open->countBy('fulfillment_stage')->map(fn (int $n, string $s): string => "{$s} {$n}")->join(', '));

        // 6. Every open day closed, the till matching or the difference explained.
        // Only days the shop's hours say it opens (a Sunday row left planned is not a missed day).
        $siteDays = SiteDay::query()->where('stock_location_id', $this->cast->site->id)
            ->whereBetween('date', [$today->subDays($days - 1)->toDateString(), $today->subDay()->toDateString()])->get()
            ->filter(fn (SiteDay $day): bool => ! ($this->sites->hoursOn($this->cast->site, $day->date->toDateString())['closed'] ?? false))
            ->values();
        $notClosed = $siteDays->filter(fn (SiteDay $day): bool => in_array($day->status, [SiteDay::STATUS_OPEN, SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED], true));
        $unexplained = $siteDays->filter(fn (SiteDay $day): bool => abs((float) $day->till_difference) >= 0.01 && empty($day->till_difference_note));
        $report->check($notClosed->isEmpty() && $unexplained->isEmpty(), 'Every open day was closed with the till counted',
            $siteDays->map(fn (SiteDay $day): string => $day->date->format('D').' '.$day->status.($day->till_difference !== null ? ' (till '.number_format((float) $day->till_count).', diff '.$day->till_difference.')' : ''))->join(', '));

        // 7. A credit customer is blocked exactly when an invoice of theirs is overdue; over a
        // whole week the one who never pays back is.
        $wrong = collect($this->cast->credit)->filter(fn ($customer): bool => $this->credit->isBlocked($customer->refresh()) !== ($this->credit->overdue((int) $customer->id)['amount'] > 0));
        $overdue = end($this->cast->credit);
        $blocked = $days < 5 || ($overdue !== false && $this->credit->isBlocked($overdue));
        $report->check($wrong->isEmpty() && $blocked, 'Credit customers are blocked exactly when overdue (the one who never repaid is)',
            collect($this->cast->credit)->map(fn ($customer): string => $customer->first_name.' owes '.number_format($this->credit->outstandingCents((int) $customer->id) / 100)
                .($this->credit->isBlocked($customer) ? ' (blocked)' : ''))->join('; '));

        // 8. Stock never below zero, and nothing stuck with a courier overnight.
        $negative = ItemStock::query()->where('quantity', '<', 0)->count();
        $report->check($negative === 0, 'No stock count went below zero', "{$negative} rows");
        $transit = StockLocation::query()->where('kind', StockLocation::KIND_TRANSIT)->pluck('id');
        $inDelivery = (int) ItemStock::query()->whereIn('stock_location_id', $transit)->whereIn('item_variant_id', collect($this->cast->goods)->pluck('item_variant_id'))->sum('quantity');
        $report->check($inDelivery === 0, 'Nothing left in In Delivery', "{$inDelivery} units");

        // 9. Every morning shipment signed in; every hand-over and expense decided.
        $shipments = Shipment::query()->where('created_by', $this->cast->person('hubkeeper')->id)->where('created_at', '>=', $from)->where('created_at', '<', $to)->get(['reference', 'status']);
        $report->check($shipments->isNotEmpty() && $shipments->every(fn (Shipment $s): bool => $s->status === 'received'), 'Every morning shipment was received',
            $shipments->countBy('status')->map(fn (int $n, string $s): string => "{$s} {$n}")->join(', '));
        $waiting = Remittance::query()->whereIn('user_id', $sellers)->where('created_at', '>=', $from)->where('created_at', '<', $to)->where('status', Remittance::STATUS_CLAIMED)->count()
            + Expense::query()->where('store_id', $this->cast->store->id)->where('created_at', '>=', $from)->where('created_at', '<', $to)->where('status', Expense::STATUS_CLAIMED)->count();
        $report->check($waiting === 0, 'Every cash hand-over and expense was confirmed', "{$waiting} waiting");
    }
}
