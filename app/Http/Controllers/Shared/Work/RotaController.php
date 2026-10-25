<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\RotaWeekRequest;
use App\Http\Requests\Workforce\SaveShiftRequest;
use App\Http\Requests\Workforce\SaveStaffingRulesRequest;
use App\Http\Requests\Workforce\ShiftChangeRequest;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\Shift;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffingRule;
use App\Models\Workforce\LeaveRequest;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The rota of one site, a week at a time (managers), and the person's own
 * accept / ask-for-a-change. Every step goes through RotaService. Each day
 * also carries its plan: who opens, closes and drives (SiteDayService), the
 * one place it is set. A Main Hub has no shifts, so its page is the plan only.
 */
class RotaController extends Controller
{
    use ReadsWorkApp;

    public function __construct(private readonly Sites $sites, private readonly RotaService $rota, private readonly LeaveService $leave, private readonly SiteDayService $days)
    {
    }

    public function show(RotaWeekRequest $request, StockLocation $site): Response
    {
        $this->authorizeSite($request->user(), $site, plan: true);
        $start = $request->weekStart();
        $end = $start->addDays(6);
        $shifts = $this->sites->hasShifts($site);
        $today = LocalTime::dateOf();

        return Inertia::render('Work/Rota', [
            'app' => $this->app($request),
            'site' => ['id' => (int) $site->id, 'name' => $site->name, 'kind_label' => $site->kind_label, 'has_shifts' => $shifts],
            'week' => $start->toDateString(),
            'days' => collect(range(0, 6))->map(function (int $i) use ($site, $start, $today, $request): array {
                $date = $start->addDays($i)->toDateString();
                // Today on: made from the hours if new. Past days: only what happened (never made up afterwards).
                $day = $date >= $today ? $this->days->day($site, LocalTime::day($date)) : SiteDay::query()->where('stock_location_id', $site->id)->whereDate('date', $date)->first();

                return [
                    'date' => $date,
                    'hours' => $this->sites->hoursOn($site, $date),
                    'plan' => $day === null ? null : $this->days->present($site, $day, $request->user()) + ['editable' => $date >= $today && in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED, SiteDay::STATUS_OPEN], true)],
                ];
            })->all(),
            'drivers' => $this->days->drivers()->all(),
            'people' => $this->sites->people($site)->map(fn (User $person): array => [
                'id' => (int) $person->id,
                'name' => trim($person->first_name.' '.$person->last_name),
                'role' => $person->roleKey(),
            ])->values()->all(),
            'shifts' => $shifts ? $this->rota->between($site, $start, $start->addWeek())
                ->map(fn (Shift $shift): array => $this->rota->present($shift))->values()->all() : [],
            'gaps' => $shifts ? $this->rota->coverage($site, $start, $end) : [],
            'leave' => $this->leave->atSite($site, $start, $end)->map(fn (LeaveRequest $leave): array => $this->leave->present($leave))->values()->all(),
            'rules' => StaffingRule::query()->where('stock_location_id', $site->id)->get()
                ->map(fn (StaffingRule $rule): array => [
                    'weekdays' => array_map('intval', $rule->weekdays ?? []),
                    'starts_at' => substr((string) $rule->starts_at, 0, 5),
                    'ends_at' => substr((string) $rule->ends_at, 0, 5),
                    'role' => $rule->role,
                    'min_people' => (int) $rule->min_people,
                ])->all(),
        ]);
    }

    public function store(SaveShiftRequest $request, StockLocation $site): RedirectResponse
    {
        return $this->attempt(fn () => $this->rota->save($site, $request->user(), $request->validated()), 'Shift added (a draft until you publish).');
    }

    public function update(SaveShiftRequest $request, Shift $shift): RedirectResponse
    {
        return $this->attempt(fn () => $this->rota->save($shift->site, $request->user(), $request->validated(), $shift), 'Shift saved.');
    }

    public function cancel(Request $request, Shift $shift): RedirectResponse
    {
        return $this->attempt(fn () => $this->rota->cancel($shift, $request->user()), 'Shift cancelled.');
    }

    public function publish(RotaWeekRequest $request, StockLocation $site): RedirectResponse
    {
        $start = $request->weekStart();

        return $this->attempt(
            fn () => $this->rota->publish($site, $request->user(), $start, $start->addDays(6)),
            fn (int $count): string => $count === 0 ? 'No drafts to publish this week.' : "{$count} shift(s) sent. Each person accepts theirs in My work.",
        );
    }

    public function copy(RotaWeekRequest $request, StockLocation $site): RedirectResponse
    {
        return $this->attempt(
            fn () => $this->rota->copyWeek($site, $request->user(), $request->weekStart()),
            fn (int $count): string => "{$count} shift(s) copied from last week as drafts.",
        );
    }

    public function saveRules(SaveStaffingRulesRequest $request, StockLocation $site): RedirectResponse
    {
        $this->authorizeSite($request->user(), $site);

        DB::transaction(function () use ($request, $site): void {
            StaffingRule::query()->where('stock_location_id', $site->id)->delete();

            foreach ($request->validated('rules') as $rule) {
                StaffingRule::query()->create([
                    'stock_location_id' => $site->id,
                    'weekdays' => array_values(array_unique(array_map('intval', $rule['weekdays']))),
                    'starts_at' => $rule['starts_at'],
                    'ends_at' => $rule['ends_at'],
                    'role' => $rule['role'],
                    'min_people' => (int) $rule['min_people'],
                ]);
            }
        });

        return back()->with('success', 'Staffing rules saved.');
    }

    public function accept(Request $request, Shift $shift): RedirectResponse
    {
        return $this->attempt(fn () => $this->rota->accept($shift, $request->user()), 'Shift accepted.');
    }

    public function requestChange(ShiftChangeRequest $request, Shift $shift): RedirectResponse
    {
        return $this->attempt(fn () => $this->rota->requestChange($shift, $request->user(), (string) $request->validated('note')), 'Sent to your manager.');
    }

    /** $plan: the page itself, which every site has (a Main Hub's is only who opens, closes and drives). */
    private function authorizeSite(?User $user, StockLocation $site, bool $plan = false): void
    {
        abort_unless($this->sites->isSite($site), 404);
        abort_unless($this->sites->canManage($user, $site), 403, 'You do not manage this site.');
        abort_unless($plan || $this->sites->hasShifts($site), 404);
    }
}
