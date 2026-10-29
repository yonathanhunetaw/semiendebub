<?php

declare(strict_types=1);

namespace App\Http\Controllers\Finance;

use App\Http\Controllers\Controller;
use App\Services\Finance\SalesReport;
use App\Services\Workforce\LocalTime;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Finance home: this month against the last, month by month (sales, takings,
 * confirmed expenses), and the last seven business days across the stores.
 */
class DashboardController extends Controller
{
    public function index(SalesReport $report): Response
    {
        $today = LocalTime::dateOf();

        return Inertia::render('Finance/Dashboard/index', [
            'months' => $report->months(null, 6),
            'recent_days' => $report->days(null, LocalTime::today()->subDays(6)->toDateString(), $today),
        ]);
    }
}
