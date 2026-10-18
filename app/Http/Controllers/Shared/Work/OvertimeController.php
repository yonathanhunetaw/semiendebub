<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\HolidayRequest;
use App\Http\Requests\Workforce\OvertimeDecisionRequest;
use App\Http\Requests\Workforce\SaveOvertimeRulesRequest;
use App\Models\Auth\User;
use App\Models\Workforce\PublicHoliday;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\OvertimeService;
use App\Services\Workforce\Sites;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The overtime rules and public holidays (everyone who manages a site reads
 * them; a global admin changes them), and a manager's yes or no on one
 * person's overtime on one day (OvertimeService).
 */
class OvertimeController extends Controller
{
    use ReadsWorkApp;

    public function __construct(private readonly OvertimeService $overtime, private readonly Sites $sites)
    {
    }

    public function show(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        abort_if($this->sites->managedBy($user)->isEmpty(), 403, 'You do not manage a site.');
        $settings = $this->overtime->settings();

        return Inertia::render('Work/Overtime', [
            'app' => $this->app($request),
            'rules' => [
                'daily_hours' => round($settings->daily_minutes / 60, 2),
                'rate_day' => $settings->rate_day,
                'rate_night' => $settings->rate_night,
                'rate_rest_day' => $settings->rate_rest_day,
                'rate_holiday' => $settings->rate_holiday,
                'night_from' => substr((string) $settings->night_from, 0, 5),
                'night_to' => substr((string) $settings->night_to, 0, 5),
                'rest_weekday' => $settings->rest_weekday,
                'needs_approval' => $settings->needs_approval,
            ],
            'holidays' => PublicHoliday::query()->whereDate('date', '>=', LocalTime::today()->subMonths(2)->toDateString())->orderBy('date')->get()
                ->map(fn (PublicHoliday $holiday): array => ['id' => (int) $holiday->id, 'date' => $holiday->date->toDateString(), 'name' => $holiday->name])->all(),
            'canEdit' => $this->sites->isGlobalAdmin($user),
        ]);
    }

    public function save(SaveOvertimeRulesRequest $request): RedirectResponse
    {
        return $this->attempt(fn () => $this->overtime->saveSettings($request->user(), $request->validated()), 'Overtime rules saved.');
    }

    public function addHoliday(HolidayRequest $request): RedirectResponse
    {
        return $this->attempt(fn () => $this->overtime->addHoliday($request->user(), (string) $request->validated('date'), (string) $request->validated('name')), 'Holiday saved.');
    }

    public function removeHoliday(Request $request, PublicHoliday $holiday): RedirectResponse
    {
        return $this->attempt(fn () => $this->overtime->removeHoliday($request->user(), $holiday), 'Holiday removed.');
    }

    public function approve(OvertimeDecisionRequest $request): RedirectResponse
    {
        $user = User::query()->findOrFail((int) $request->validated('user_id'));

        return $this->attempt(fn () => $this->overtime->approve($request->user(), $user, (string) $request->validated('date'), $request->validated('note')), 'Overtime approved.');
    }

    public function reject(OvertimeDecisionRequest $request): RedirectResponse
    {
        $user = User::query()->findOrFail((int) $request->validated('user_id'));

        return $this->attempt(fn () => $this->overtime->reject($request->user(), $user, (string) $request->validated('date'), (string) $request->validated('note')), 'Overtime not paid.');
    }
}
