<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\ForceKeyRequest;
use App\Http\Requests\Workforce\HandOverKeyRequest;
use App\Http\Requests\Workforce\HomeAreaRequest;
use App\Http\Requests\Workforce\RejectKeyRequest;
use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Models\Workforce\StaffRide;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use App\Services\Workforce\StaffRideService;
use App\Services\Workforce\SwapService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * "My work", in tabs: Today (clocked in, opening and closing at each site,
 * the driver's planned runs), Shifts, Keys, Leave and Rides. A manager also
 * sees their sites (to plan shifts and who opens, closes and drives) and the
 * keys of those sites. Key steps go through KeyCustodyService.
 */
class WorkController extends Controller
{
    use ReadsWorkApp;

    public function __construct(
        private readonly KeyCustodyService $keys,
        private readonly Sites $sites,
        private readonly SiteDayService $days,
        private readonly RotaService $rota,
        private readonly AttendanceService $attendance,
        private readonly LeaveService $leave,
        private readonly SwapService $swaps,
        private readonly StaffRideService $rides,
    ) {
    }

    public function index(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();

        return Inertia::render('Work/Index', [
            'app' => $this->app($request),
            'keys' => $this->keys->heldBy($user)->map(fn (CustodyKey $key): array => $this->keys->present($key, $user) + [
                'receivers' => $this->keys->receivers($key, $user),
            ])->values()->all(),
            'waiting' => $this->keys->waitingFor($user)->map(fn (KeyHandover $handover): array => $this->keys->presentHandover($handover))->values()->all(),
            // Today at each site: who opens / closes, open or not.
            'days' => $this->days->todayFor($user)->all(),
            // My shifts for the next two weeks: accept, or ask for a change.
            'shifts' => $this->rota->upcomingFor($user)->map(fn (Shift $shift): array => $this->rota->present($shift))->values()->all(),
            // Where I am clocked in now, if anywhere.
            'clock' => ($entry = $this->attendance->openEntry($user)) ? $this->attendance->present($entry) : null,
            'leave' => $this->leave->mine($user)->map(fn (LeaveRequest $leave): array => $this->leave->present($leave))->values()->all(),
            'leaveTypes' => LeaveRequest::TYPES,
            // Shifts offered to me, and mine I offered.
            'offers' => $this->swaps->offersFor($user)->map(fn (ShiftSwap $swap): array => $this->swaps->present($swap))->values()->all(),
            'offered' => $this->swaps->openFrom($user)->map(fn (ShiftSwap $swap): array => $this->swaps->present($swap))->values()->all(),
            // Who I could offer a shift to, per site.
            'colleagues' => $this->sites->workedAtBy($user)
                ->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site))
                ->mapWithKeys(fn (StockLocation $site): array => [$site->id => $this->sites->people($site)
                    ->reject(fn (User $person): bool => (int) $person->id === (int) $user->id)
                    ->map(fn (User $person): array => ['id' => (int) $person->id, 'name' => trim($person->first_name.' '.$person->last_name)])
                    ->values()->all()])
                ->all(),
            'rides' => $this->rides->forStaff($user)
                ->filter(fn (StaffRide $ride): bool => $ride->riders->contains('user_id', $user->id))
                ->map(fn (StaffRide $ride): array => $this->rides->present($ride, $user))->values()->all(),
            // A driver's runs from the days' plans: bring the opener in, take the closer home.
            'driving' => $user->is_driver ? $this->rides->forDriver($user)
                ->filter(fn (StaffRide $ride): bool => $ride->purpose !== null && (int) $ride->driver_id === (int) $user->id)
                ->map(fn (StaffRide $ride): array => $this->rides->present($ride, $user))->values()->all() : [],
            'homeArea' => $user->home_area,
            'managesSites' => ($managed = $this->sites->managedBy($user))->isNotEmpty(),
            'sites' => $managed->map(fn (StockLocation $site): array => [
                'id' => (int) $site->id,
                'name' => $site->name,
                'kind' => $site->kind,
                'kind_label' => $site->kind_label,
                'has_shifts' => $this->sites->hasShifts($site),
            ])->values()->all(),
            // The keys of the sites I manage that someone else holds (mine are in `keys`), with their log.
            'siteKeys' => $managed->map(fn (StockLocation $site): CustodyKey => $this->keys->keyFor($site))
                ->reject(fn (CustodyKey $key): bool => (int) $key->holder_id === (int) $user->id)
                ->map(fn (CustodyKey $key): array => $this->keys->present($key, $user, true) + ['receivers' => $this->keys->receivers($key)])
                ->values()->all(),
            'reasons' => KeyHandover::REASONS,
        ]);
    }

    public function startBreak(Request $request): RedirectResponse
    {
        return $this->attempt(fn () => $this->attendance->startBreak($request->user()), 'On a break. End it in My work.');
    }

    public function endBreak(Request $request): RedirectResponse
    {
        return $this->attempt(fn () => $this->attendance->endBreak($request->user()), 'Back from the break.');
    }

    public function homeArea(HomeAreaRequest $request): RedirectResponse
    {
        $area = trim((string) $request->validated('home_area'));
        $request->user()->update(['home_area' => $area !== '' ? $area : null]);

        return back()->with('success', 'Saved. Staff transport drops you there.');
    }

    public function handOver(HandOverKeyRequest $request, CustodyKey $key): RedirectResponse
    {
        $to = User::query()->findOrFail((int) $request->validated('to_id'));

        return $this->attempt(
            fn () => $this->keys->handOver($key, $request->user(), $to, $request->validated('reason'), $request->validated('note')),
            sprintf('Handed to %s. It is yours until they accept it.', $to->first_name),
        );
    }

    public function accept(Request $request, KeyHandover $handover): RedirectResponse
    {
        return $this->attempt(fn () => $this->keys->accept($handover, $request->user()), 'You hold the key now.');
    }

    public function reject(RejectKeyRequest $request, KeyHandover $handover): RedirectResponse
    {
        return $this->attempt(fn () => $this->keys->reject($handover, $request->user(), $request->validated('note')), 'Noted: the key stays with the giver.');
    }

    public function cancel(Request $request, KeyHandover $handover): RedirectResponse
    {
        return $this->attempt(fn () => $this->keys->cancel($handover, $request->user()), 'Hand-over cancelled.');
    }

    public function force(ForceKeyRequest $request, CustodyKey $key): RedirectResponse
    {
        $to = User::query()->findOrFail((int) $request->validated('to_id'));

        return $this->attempt(
            fn () => $this->keys->force($key, $request->user(), $to, (string) $request->validated('note')),
            sprintf('%s holds the key now.', $to->first_name),
        );
    }
}
