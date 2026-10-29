<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Models\Finance\Payment;
use App\Models\Finance\Sale;
use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use App\Models\Workforce\SiteDay;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\ShopDay;
use Illuminate\Contracts\Database\Query\Expression;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * The Finance reports: sales and takings per store per business day, what
 * came in while stores were closed, payment methods over a period, and
 * month by month with confirmed expenses.
 *
 *   sales     orders placed (not cancelled), at their order total
 *   takings   money confirmed by a second person, not credit, at the time it was taken
 *   credit    sold on credit in the period (owed, not taken)
 *
 * A business day runs from opening to closing (ShopDay); months and the
 * method breakdown are Addis calendar dates.
 */
final class SalesReport
{
    /** At most this many days in one report (one query set per store per day). */
    public const MAX_DAYS = 62;

    public function __construct(private readonly ShopDay $shopDay, private readonly ExpenseService $expenses)
    {
    }

    /**
     * Every business day the stores opened between two shop dates, newest first.
     *
     * @param  array<int, int>|null  $storeIds  null = every retail store
     * @return list<array<string, mixed>>
     */
    public function days(?array $storeIds, string $from, string $to): array
    {
        $rows = [];

        foreach ($this->sites($storeIds) as $site) {
            foreach ($this->shopDay->opened($site, $from, $to) as $day) {
                $rows[] = $this->dayRow($site, $day);
            }
        }

        usort($rows, fn (array $a, array $b): int => [$b['date'], $a['store']] <=> [$a['date'], $b['store']]);

        return $rows;
    }

    /**
     * What happened at each store while it was closed, between two shop dates.
     *
     * @param  array<int, int>|null  $storeIds
     * @return list<array<string, mixed>>
     */
    public function outsideHours(?array $storeIds, string $from, string $to): array
    {
        [$start, $end] = [LocalTime::startOf($from), LocalTime::startOf(LocalTime::day($to)->addDay())];
        $rows = [];

        foreach ($this->sites($storeIds) as $site) {
            $sales = $this->shopDay->outsideHours(
                $this->sales((int) $site->store_id)->where('sales.created_at', '>=', $start)->where('sales.created_at', '<', $end),
                'sales.created_at',
                'sales.store_id',
            );
            $takings = $this->shopDay->outsideHours(
                $this->takings((int) $site->store_id)->where($this->takenAt(), '>=', $start)->where($this->takenAt(), '<', $end),
                $this->takenAt(),
                $this->storeOf(),
            );

            $orders = (clone $sales)->count();
            $taken = round((float) $takings->sum('payments.amount'), 2);

            if ($orders === 0 && $taken === 0.0) {
                continue;
            }

            $rows[] = [
                'store_id' => (int) $site->store_id,
                'store' => (string) $site->name,
                'orders' => $orders,
                'sales' => round((float) $sales->sum('sales.total_amount'), 2),
                'takings' => $taken,
            ];
        }

        return $rows;
    }

    /**
     * Confirmed takings per payment method between two shop dates.
     *
     * @param  array<int, int>|null  $storeIds
     * @return list<array{method: string, total: float, count: int}>
     */
    public function methods(?array $storeIds, string $from, string $to): array
    {
        return Payment::query()->confirmed()
            ->where($this->takenAt(), '>=', LocalTime::startOf($from))
            ->where($this->takenAt(), '<', LocalTime::startOf(LocalTime::day($to)->addDay()))
            ->when($storeIds !== null, fn ($q) => $q->whereIn($this->storeOf(), $storeIds ?: [0]))
            ->selectRaw('payment_method, SUM(amount) as total, COUNT(*) as n')
            ->groupBy('payment_method')
            ->orderByDesc('total')
            ->get()
            ->map(fn ($row): array => ['method' => (string) $row->payment_method, 'total' => round((float) $row->total, 2), 'count' => (int) $row->n])
            ->values()
            ->all();
    }

    /**
     * The last N calendar months, newest first: sales, takings, confirmed
     * expenses, and takings less expenses. Expenses are company-wide.
     *
     * @param  array<int, int>|null  $storeIds
     * @return list<array<string, mixed>>
     */
    public function months(?array $storeIds, int $count = 6): array
    {
        $rows = [];
        $first = LocalTime::today()->startOfMonth();

        for ($i = 0; $i < $count; $i++) {
            $month = $first->subMonths($i);
            [$start, $end] = [LocalTime::startOf($month), LocalTime::startOf($month->addMonth())];

            $sales = Sale::query()->where('fulfillment_stage', '!=', Sale::STAGE_CANCELLED)
                ->when($storeIds !== null, fn ($q) => $q->whereIn('store_id', $storeIds ?: [0]))
                ->where('created_at', '>=', $start)->where('created_at', '<', $end);
            $takings = Payment::query()->confirmed()
                ->where('payments.payment_method', '!=', Payment::METHOD_CREDIT)
                ->when($storeIds !== null, fn ($q) => $q->whereIn($this->storeOf(), $storeIds ?: [0]))
                ->where($this->takenAt(), '>=', $start)->where($this->takenAt(), '<', $end);

            $taken = round((float) $takings->sum('payments.amount'), 2);
            $spent = round(array_sum($this->expenses->totals($month->toDateString(), $month->endOfMonth()->toDateString())), 2);

            $rows[] = [
                'month' => $month->format('Y-m'),
                'label' => $month->format('F Y'),
                'orders' => (clone $sales)->count(),
                'sales' => round((float) $sales->sum('total_amount'), 2),
                'takings' => $taken,
                'expenses' => $spent,
                'net' => round($taken - $spent, 2),
            ];
        }

        return $rows;
    }

    /** @return array<string, mixed> */
    private function dayRow(StockLocation $site, SiteDay $day): array
    {
        $storeId = (int) $site->store_id;
        $span = $this->shopDay->span($day);
        $sales = $this->shopDay->within($this->sales($storeId), 'sales.created_at', $day);
        $paid = fn () => $this->shopDay->within(Payment::query()->confirmed()->where($this->storeOf(), $storeId), $this->takenAt(), $day);

        $byMethod = $paid()->where('payments.payment_method', '!=', Payment::METHOD_CREDIT)
            ->selectRaw('payment_method, SUM(amount) as total')
            ->groupBy('payment_method')
            ->pluck('total', 'payment_method')
            ->map(fn ($total): float => round((float) $total, 2))
            ->all();

        return [
            'store_id' => $storeId,
            'store' => (string) $site->name,
            'date' => $day->date->toDateString(),
            'status' => (string) $day->status,
            'opened_at' => $span[0]->toIso8601String(),
            'closed_at' => $span[1]?->toIso8601String(),
            'closed_late' => (bool) $day->closed_late,
            'orders' => (clone $sales)->count(),
            'sales' => round((float) $sales->sum('sales.total_amount'), 2),
            'takings' => round(array_sum($byMethod), 2),
            'by_method' => $byMethod,
            'credit' => round((float) $paid()->where('payments.payment_method', Payment::METHOD_CREDIT)->sum('payments.amount'), 2),
            // Frozen at closing (phase 4): null while open or when no cash moved.
            'till_difference' => $day->till_difference !== null ? (float) $day->till_difference : null,
            'till_difference_note' => $day->till_difference_note,
            'cash_unconfirmed' => $day->cash_unconfirmed !== null ? (float) $day->cash_unconfirmed : null,
        ];
    }

    /** @return Builder<Sale> */
    private function sales(int $storeId): Builder
    {
        return Sale::query()->where('sales.store_id', $storeId)->where('sales.fulfillment_stage', '!=', Sale::STAGE_CANCELLED);
    }

    /** @return Builder<Payment> */
    private function takings(int $storeId): Builder
    {
        return Payment::query()->confirmed()
            ->where('payments.payment_method', '!=', Payment::METHOD_CREDIT)
            ->where($this->storeOf(), $storeId);
    }

    /** @return \Illuminate\Support\Collection<int, StockLocation> */
    private function sites(?array $storeIds)
    {
        $retail = Store::query()->where('type', Store::TYPE_RETAIL)->select('id');

        return StockLocation::query()
            ->where('kind', StockLocation::KIND_STORE)
            ->whereIn('store_id', $retail)
            ->when($storeIds !== null, fn ($q) => $q->whereIn('store_id', $storeIds ?: [0]))
            ->orderBy('name')
            ->get();
    }

    /** When a payment was taken. */
    private function takenAt(): Expression
    {
        return DB::raw('COALESCE(payments.paid_at, payments.created_at)');
    }

    /** A payment's store: its order's, else (a credit repayment) its customer's. */
    private function storeOf(): Expression
    {
        return DB::raw('COALESCE((select store_id from sales where sales.id = payments.sale_id), (select store_id from customers where customers.id = payments.customer_id))');
    }
}
