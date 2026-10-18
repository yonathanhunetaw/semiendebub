<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\HoursExportRequest;
use App\Models\Inventory\StockLocation;
use App\Services\Workforce\HoursReport;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * The hours download (CSV) for salaries: one site, or every site the
 * manager runs. `detail=1` gives one row per clock-in instead of per person.
 */
class HoursController extends Controller
{
    use ReadsWorkApp;

    public function __construct(private readonly Sites $sites, private readonly HoursReport $report)
    {
    }

    public function site(HoursExportRequest $request, StockLocation $site): Response
    {
        abort_unless($this->sites->isSite($site) && $this->sites->hasShifts($site), 404);
        abort_unless($this->sites->canManage($request->user(), $site), 403, 'You do not manage this site.');

        return $this->download($request, collect([$site]), Str::slug($site->name));
    }

    public function all(HoursExportRequest $request): Response
    {
        $sites = $this->sites->managedBy($request->user())->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site))->values()->toBase();
        abort_if($sites->isEmpty(), 403, 'You do not manage a site with shifts.');

        return $this->download($request, $sites, 'all-sites');
    }

    /** @param Collection<int, StockLocation> $sites */
    private function download(HoursExportRequest $request, Collection $sites, string $name): Response
    {
        $from = CarbonImmutable::parse($request->validated('from'));
        $to = CarbonImmutable::parse($request->validated('to'));
        $detail = (bool) $request->validated('detail');

        $csv = $detail
            ? $this->report->csv(HoursReport::DETAIL_COLUMNS, $this->report->detail($sites, $from, $to))
            : $this->report->csv(HoursReport::SUMMARY_COLUMNS, $this->report->summary($sites, $from, $to));

        $file = sprintf('hours-%s-%s-to-%s%s.csv', $name, $from->toDateString(), $to->toDateString(), $detail ? '-detail' : '');

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=UTF-8',
            'Content-Disposition' => 'attachment; filename="'.$file.'"',
        ]);
    }
}
