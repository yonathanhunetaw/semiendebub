<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\AskLeaveRequest;
use App\Http\Requests\Workforce\DecisionRequest;
use App\Http\Requests\Workforce\OfferShiftRequest;
use App\Http\Requests\Workforce\RecordLeaveRequest;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use App\Services\Workforce\SwapService;
use Carbon\CarbonImmutable;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Leave and shift swaps: asking (everyone, from My work) and deciding
 * (managers, on the Team page). Every step goes through LeaveService or
 * SwapService.
 */
class TeamController extends Controller
{
    use ReadsWorkApp;

    public function __construct(
        private readonly Sites $sites,
        private readonly LeaveService $leave,
        private readonly SwapService $swaps,
    ) {
    }

    /** Managers: leave and swaps waiting on them, leave coming up, and recording leave. */
    public function index(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $sites = $this->sites->managedBy($user)->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site));
        abort_if($sites->isEmpty(), 403, 'You do not manage a site with shifts.');

        $people = $sites->flatMap(fn (StockLocation $site) => $this->sites->people($site))->unique('id')
            ->reject(fn (User $person): bool => (int) $person->id === (int) $user->id)
            ->sortBy('first_name')->values();

        return Inertia::render('Work/Team', [
            'app' => $this->app($request),
            'leave' => $this->leave->awaiting($user)->map(fn (LeaveRequest $leave): array => $this->leave->present($leave))->values()->all(),
            'swaps' => $this->swaps->awaiting($user)->map(fn (ShiftSwap $swap): array => $this->swaps->present($swap))->values()->all(),
            'upcoming' => LeaveRequest::query()
                ->whereIn('user_id', $people->pluck('id'))
                ->where('status', LeaveRequest::STATUS_APPROVED)
                ->overlapping(LocalTime::dateOf(), LocalTime::today()->addDays(30)->toDateString())
                ->orderBy('starts_on')->get()
                ->map(fn (LeaveRequest $leave): array => $this->leave->present($leave))->values()->all(),
            'people' => $people->map(fn (User $person): array => ['id' => (int) $person->id, 'name' => trim($person->first_name.' '.$person->last_name)])->all(),
            'types' => LeaveRequest::TYPES,
            // Who said they can't open, close or drive in the week ahead: pick someone else on the Rota.
            'cantDo' => app(\App\Services\Workforce\SiteDayService::class)->cantDo($user)
                ->map(fn (\App\Models\Workforce\SiteDayAnswer $answer): array => [
                    'id' => (int) $answer->id,
                    'duty' => $answer->duty,
                    'note' => $answer->note,
                    'who' => $answer->user ? trim($answer->user->first_name.' '.$answer->user->last_name) : null,
                    'date' => $answer->siteDay->date->toDateString(),
                    'site' => ['id' => (int) $answer->siteDay->site->id, 'name' => $answer->siteDay->site->name],
                ])->values()->all(),
        ]);
    }

    public function askLeave(AskLeaveRequest $request): RedirectResponse
    {
        return $this->attempt(fn () => $this->leave->request(
            $request->user(),
            (string) $request->validated('type'),
            CarbonImmutable::parse($request->validated('starts_on')),
            CarbonImmutable::parse($request->validated('ends_on')),
            $request->validated('note'),
        ), 'Leave asked for. Your manager decides.');
    }

    public function recordLeave(RecordLeaveRequest $request): RedirectResponse
    {
        $user = User::query()->findOrFail((int) $request->validated('user_id'));

        return $this->attempt(fn () => $this->leave->record(
            $request->user(),
            $user,
            (string) $request->validated('type'),
            CarbonImmutable::parse($request->validated('starts_on')),
            CarbonImmutable::parse($request->validated('ends_on')),
            $request->validated('note'),
        ), fn (array $result): string => sprintf('Leave recorded for %s. %d shift(s) cancelled.', $user->first_name, $result['cancelled']));
    }

    public function approveLeave(DecisionRequest $request, LeaveRequest $leave): RedirectResponse
    {
        return $this->attempt(
            fn () => $this->leave->approve($leave, $request->user(), $request->validated('note')),
            fn (int $cancelled): string => $cancelled > 0 ? "Approved. {$cancelled} of their shift(s) cancelled: check the rota." : 'Approved.',
        );
    }

    public function rejectLeave(DecisionRequest $request, LeaveRequest $leave): RedirectResponse
    {
        return $this->attempt(fn () => $this->leave->reject($leave, $request->user(), (string) $request->validated('note')), 'Leave turned down.');
    }

    public function cancelLeave(Request $request, LeaveRequest $leave): RedirectResponse
    {
        return $this->attempt(fn () => $this->leave->cancel($leave, $request->user()), 'Leave cancelled.');
    }

    public function offer(OfferShiftRequest $request, Shift $shift): RedirectResponse
    {
        $to = User::query()->findOrFail((int) $request->validated('to_id'));

        return $this->attempt(
            fn () => $this->swaps->offer($shift, $request->user(), $to, $request->validated('note')),
            sprintf('Offered to %s. It stays yours until they take it and a manager agrees.', $to->first_name),
        );
    }

    public function take(Request $request, ShiftSwap $swap): RedirectResponse
    {
        return $this->attempt(fn () => $this->swaps->take($swap, $request->user()), 'Taken. A manager approves it, then it is yours.');
    }

    public function decline(DecisionRequest $request, ShiftSwap $swap): RedirectResponse
    {
        return $this->attempt(fn () => $this->swaps->decline($swap, $request->user(), $request->validated('note')), 'Declined.');
    }

    public function approveSwap(Request $request, ShiftSwap $swap): RedirectResponse
    {
        return $this->attempt(fn () => $this->swaps->approve($swap, $request->user()), 'Swap approved. The shift has moved.');
    }

    public function rejectSwap(DecisionRequest $request, ShiftSwap $swap): RedirectResponse
    {
        return $this->attempt(fn () => $this->swaps->reject($swap, $request->user(), $request->validated('note')), 'Swap turned down.');
    }

    public function cancelSwap(Request $request, ShiftSwap $swap): RedirectResponse
    {
        return $this->attempt(fn () => $this->swaps->cancel($swap, $request->user()), 'Offer taken back.');
    }
}
