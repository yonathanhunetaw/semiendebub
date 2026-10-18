<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared\Work;

use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Http\Controllers\Shared\Work\Concerns\ReadsWorkApp;
use App\Http\Requests\Workforce\ClaimRideRequest;
use App\Http\Requests\Workforce\DropRiderRequest;
use App\Http\Requests\Workforce\RequestRideRequest;
use App\Http\Requests\Workforce\RideFuelRequest;
use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\StaffRide;
use App\Services\Finance\ExpenseService;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use App\Services\Workforce\StaffRideService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Staff transport. On the delivery app: rides to take and the driver's own.
 * Elsewhere: rides I am on or asked for, and asking for one (managers, and
 * the day's opener or closer).
 */
class RideController extends Controller
{
    use ReadsWorkApp;

    public function __construct(
        private readonly Sites $sites,
        private readonly StaffRideService $rides,
        private readonly AttendanceService $attendance,
    ) {
    }

    public function index(Request $request): Response
    {
        /** @var User $user */
        $user = $request->user();
        $app = $this->app($request);
        $driver = $app === 'delivery';

        $list = $driver ? $this->rides->forDriver($user) : $this->rides->forStaff($user);

        return Inertia::render('Work/Rides', [
            'app' => $app,
            'driver' => $driver,
            'rides' => $list->map(fn (StaffRide $ride): array => $this->rides->present($ride, $user))->values()->all(),
            'vehicles' => $driver ? Vehicle::query()->active()->orderBy('name')->get()->map(fn (Vehicle $car): array => [
                'id' => (int) $car->id,
                'name' => $car->name,
                'plate' => $car->plate,
                'key_holder_id' => $car->custodyKey?->holder_id,
            ])->values()->all() : [],
            // Where I can ask for a ride from, who works there, who is in now.
            'sites' => $driver ? [] : $this->sites->workedAtBy($user)
                ->filter(fn (StockLocation $site): bool => $this->rides->mayRequest($user, $site))
                ->map(fn (StockLocation $site): array => [
                    'id' => (int) $site->id,
                    'name' => $site->name,
                    'closes_at' => LocalTime::wall($this->sites->closesAt($site, now())),
                    'people' => $this->sites->people($site)->map(fn (User $person): array => [
                        'id' => (int) $person->id,
                        'name' => trim($person->first_name.' '.$person->last_name),
                        'home_area' => $person->home_area,
                    ])->values()->all(),
                    'in_now' => $this->attendance->stillIn($site)->pluck('user_id')->map(fn ($id): int => (int) $id)->all(),
                ])->values()->all(),
        ]);
    }

    public function store(RequestRideRequest $request, StockLocation $site): RedirectResponse
    {
        abort_unless($this->sites->isSite($site), 404);

        return $this->attempt(fn () => $this->rides->request(
            $site,
            $request->user(),
            LocalTime::parse((string) $request->validated('departs_at')),
            $request->validated('rider_ids'),
            $request->validated('note'),
        ), 'Ride asked for. Drivers see it in their app.');
    }

    public function claim(ClaimRideRequest $request, StaffRide $ride): RedirectResponse
    {
        $car = Vehicle::query()->findOrFail((int) $request->validated('vehicle_id'));

        return $this->attempt(fn () => $this->rides->claim($ride, $request->user(), $car), sprintf('Ride is yours, in %s.', $car->plate));
    }

    public function release(Request $request, StaffRide $ride): RedirectResponse
    {
        return $this->attempt(fn () => $this->rides->release($ride, $request->user()), 'Ride given back.');
    }

    public function depart(Request $request, StaffRide $ride): RedirectResponse
    {
        return $this->attempt(fn () => $this->rides->depart($ride, $request->user()), 'On the way.');
    }

    public function drop(DropRiderRequest $request, StaffRide $ride): RedirectResponse
    {
        return $this->attempt(
            fn () => $this->rides->drop($ride, $request->user(), (int) $request->validated('user_id'), (bool) $request->validated('showed_up')),
            $request->validated('showed_up') ? 'Dropped off.' : 'Marked as not there.',
        );
    }

    public function finish(Request $request, StaffRide $ride): RedirectResponse
    {
        return $this->attempt(fn () => $this->rides->finish($ride, $request->user()), 'Ride done.');
    }

    public function cancel(Request $request, StaffRide $ride): RedirectResponse
    {
        return $this->attempt(fn () => $this->rides->cancel($ride, $request->user()), 'Ride cancelled.');
    }

    /** The fuel the ride took: an expense, waiting for finance to confirm. */
    public function fuel(RideFuelRequest $request, StaffRide $ride, ExpenseService $expenses): RedirectResponse
    {
        try {
            $expenses->rideFuel(
                $ride,
                $request->user(),
                (float) $request->validated('amount'),
                $request->validated('litres') !== null ? (float) $request->validated('litres') : null,
                $request->file('receipt'),
            );
        } catch (PaymentException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Fuel recorded. Finance confirms it.');
    }

    public function optOut(Request $request, StaffRide $ride): RedirectResponse
    {
        return $this->attempt(fn () => $this->rides->optOut($ride, $request->user()), 'Noted: you do not need this ride.');
    }
}
