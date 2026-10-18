<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\FixTimeEntryRequest;
use App\Http\Requests\Workforce\ManagerClockRequest;
use App\Http\Requests\Workforce\RotaWeekRequest;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\TimeEntry;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\OvertimeService;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Who clocked in and out at a site, a week at a time, for its managers: who
 * is in now, late and early flags, rows the sweep closed, and fixing them.
 */
class AttendanceController extends Controller
{
    use ReadsWorkApp;

    public function __construct(private readonly Sites $sites, private readonly AttendanceService $attendance, private readonly OvertimeService $overtime)
    {
    }

    public function show(RotaWeekRequest $request, StockLocation $site): Response
    {
        $this->authorizeSite($request->user(), $site);
        $start = $request->weekStart();

        return Inertia::render('Work/Attendance', [
            'app' => $this->app($request),
            'site' => ['id' => (int) $site->id, 'name' => $site->name, 'kind_label' => $site->kind_label],
            'week' => $start->toDateString(),
            'here' => $this->attendance->stillIn($site)->map(fn (TimeEntry $entry): array => $this->attendance->present($entry))->values()->all(),
            'entries' => $this->attendance->between($site, $start, $start->addWeek())
                ->map(fn (TimeEntry $entry): array => $this->attendance->present($entry))->values()->all(),
            // Overtime of the people who worked here this week, with the manager's decision.
            'overtime' => collect($this->overtime->forSites(collect([$site]), $start, $start->addDays(6)))
                ->map(fn (array $day): array => $day + ['can_decide' => $this->overtime->mayDecide($request->user(), (int) $day['user_id'], (string) $day['date'])])
                ->values()->all(),
            'needsApproval' => $this->overtime->settings()->needs_approval,
            'people' => $this->sites->people($site)->map(fn (User $person): array => [
                'id' => (int) $person->id,
                'name' => trim($person->first_name.' '.$person->last_name),
            ])->values()->all(),
        ]);
    }

    public function clockIn(ManagerClockRequest $request, StockLocation $site): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);
        $user = User::query()->findOrFail((int) $request->validated('user_id'));

        return $this->attempt(
            fn () => $this->attendance->managerClockIn($request->user(), $user, $site, $this->at($request->validated('at')), (string) $request->validated('note')),
            sprintf('%s clocked in.', $user->first_name),
        );
    }

    public function clockOut(ManagerClockRequest $request, TimeEntry $entry): RedirectResponse
    {
        return $this->attempt(
            fn () => $this->attendance->managerClockOut($request->user(), $entry, $this->at($request->validated('at')), (string) $request->validated('note')),
            'Clocked out.',
        );
    }

    public function fix(FixTimeEntryRequest $request, TimeEntry $entry): RedirectResponse
    {
        return $this->attempt(fn () => $this->attendance->fix(
            $request->user(),
            $entry,
            LocalTime::parse((string) $request->validated('clock_in_at')),
            $request->validated('clock_out_at') ? LocalTime::parse((string) $request->validated('clock_out_at')) : null,
            (string) $request->validated('note'),
        ), 'Times fixed.');
    }

    public function review(Request $request, TimeEntry $entry): RedirectResponse
    {
        return $this->attempt(fn () => $this->attendance->review($request->user(), $entry), 'Marked as looked at.');
    }

    private function at(?string $value): ?CarbonImmutable
    {
        return $value ? LocalTime::parse($value) : null;
    }

    private function authorizeSite(?User $user, StockLocation $site): void
    {
        abort_unless($this->sites->isSite($site) && $this->sites->hasShifts($site), 404);
        abort_unless($this->sites->canManage($user, $site), 403, 'You do not manage this site.');
    }
}
