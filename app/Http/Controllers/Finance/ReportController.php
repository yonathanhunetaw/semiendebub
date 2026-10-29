<?php

declare(strict_types=1);

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\SalesReportRequest;
use App\Models\Store\Store;
use App\Services\Finance\SalesReport;
use App\Services\Workforce\LocalTime;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Sales and takings per store per business day, what came in while stores
 * were closed, and payment methods over the period (SalesReport).
 */
class ReportController extends Controller
{
    /** The default period: the last two weeks of shop dates. */
    private const DEFAULT_DAYS = 14;

    public function index(SalesReportRequest $request, SalesReport $report): Response
    {
        $to = (string) ($request->validated('to') ?? LocalTime::dateOf());
        $from = (string) ($request->validated('from') ?? LocalTime::day($to)->subDays(self::DEFAULT_DAYS - 1)->toDateString());

        // A report covers at most MAX_DAYS: a longer period keeps its end date.
        $limited = LocalTime::day($from)->diffInDays(LocalTime::day($to)) >= SalesReport::MAX_DAYS;
        if ($limited) {
            $from = LocalTime::day($to)->subDays(SalesReport::MAX_DAYS - 1)->toDateString();
        }

        $storeId = $request->validated('store') !== null ? (int) $request->validated('store') : null;
        $storeIds = $storeId !== null ? [$storeId] : null;

        return Inertia::render('Finance/Reports/index', [
            'filters' => ['from' => $from, 'to' => $to, 'store' => $storeId],
            'limited' => $limited,
            'max_days' => SalesReport::MAX_DAYS,
            'stores' => Store::query()->where('type', Store::TYPE_RETAIL)->orderBy('name')->get(['id', 'name'])
                ->map(fn (Store $store): array => ['id' => (int) $store->id, 'name' => (string) $store->name])->values(),
            'days' => $report->days($storeIds, $from, $to),
            'outside' => $report->outsideHours($storeIds, $from, $to),
            'methods' => $report->methods($storeIds, $from, $to),
        ]);
    }
}
