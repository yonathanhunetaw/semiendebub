<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use App\Exceptions\WorkforceException;
use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Fulfillment\Delivery;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\CustodyKey;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffRide;
use App\Models\Workforce\StaffRideRider;
use App\Services\DeliveryService;
use App\Services\ShipmentWorkflowService as Workflow;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Staff transport: a fleet car taking staff home (or to work).
 *
 *   request  a manager of the site, or that day's opener or closer, asks for
 *            a ride from the site at a time, with who rides. Each rider's
 *            drop-off is their home area (they set it in My work).
 *   optOut   a rider who does not need it says so.
 *   claim    a driver takes it with a car that is free then: not on a
 *            freight run, a delivery or another ride around that time.
 *   release  the driver gives it back before setting off.
 *   depart   the driver sets off.
 *   drop     each rider dropped off (or did not show).
 *   finish   once nobody is still riding.
 *   cancel   whoever asked, or a manager, before it sets off.
 *   planFor  a site day's plan makes its two rides: the driver brings the
 *            opener in before opening and takes the closer home after
 *            closing. They are kept in step with the plan until they set off,
 *            and only that driver takes them.
 */
class StaffRideService
{
    /** A car counts as busy this long either side of another booked run. */
    public const BUSY_HOURS = 2;

    /** The opener's pick-up is this long before opening. */
    public const PICKUP_LEAD_MINUTES = 45;

    public function __construct(private readonly Sites $sites)
    {
    }

    /**
     * @param  array<int, int>  $riderIds
     *
     * @throws WorkforceException
     */
    public function request(StockLocation $site, User $by, CarbonInterface $departsAt, array $riderIds, ?string $note = null): StaffRide
    {
        if (! $this->mayRequest($by, $site)) {
            throw new WorkforceException('A manager of this site, or today’s opener or closer, asks for staff transport.', 403);
        }

        if (CarbonImmutable::instance($departsAt)->lessThan(now()->subMinutes(30))) {
            throw new WorkforceException('Pick a time from now on.');
        }

        $riders = User::query()->whereIn('id', array_unique(array_map('intval', $riderIds)))->get()
            ->filter(fn (User $user): bool => $this->sites->worksAt($user, $site));

        if ($riders->isEmpty()) {
            throw new WorkforceException('Pick who rides: people who work at this site.');
        }

        return DB::transaction(function () use ($site, $by, $departsAt, $riders, $note): StaffRide {
            $ride = StaffRide::create([
                'stock_location_id' => $site->id,
                'departs_at' => CarbonImmutable::instance($departsAt)->utc(),
                'status' => StaffRide::STATUS_REQUESTED,
                'note' => $note !== null && trim($note) !== '' ? trim($note) : null,
                'created_by' => $by->id,
            ]);

            foreach ($riders as $rider) {
                $ride->riders()->create(['user_id' => $rider->id, 'drop_off' => $rider->home_area, 'status' => StaffRideRider::STATUS_RIDING]);
            }

            return $ride;
        });
    }

    /** @throws WorkforceException */
    public function optOut(StaffRide $ride, User $rider): StaffRide
    {
        $this->mustBeOpenBefore($ride, [StaffRide::STATUS_REQUESTED, StaffRide::STATUS_CLAIMED]);
        $row = $ride->riders()->where('user_id', $rider->id)->where('status', StaffRideRider::STATUS_RIDING)->first();

        if ($row === null) {
            throw new WorkforceException('You are not on this ride.');
        }

        $row->update(['status' => StaffRideRider::STATUS_NOT_RIDING]);

        return $ride;
    }

    /** @throws WorkforceException */
    public function claim(StaffRide $ride, User $driver, Vehicle $vehicle): StaffRide
    {
        return DB::transaction(function () use ($ride, $driver, $vehicle): StaffRide {
            $ride = StaffRide::query()->lockForUpdate()->findOrFail($ride->id);

            if (! $driver->is_driver) {
                throw new WorkforceException('Only a driver takes a staff ride.', 403);
            }

            if ($ride->status !== StaffRide::STATUS_REQUESTED) {
                throw new WorkforceException('Another driver has this ride, or it is closed.');
            }

            if ($ride->driver_id !== null && (int) $ride->driver_id !== (int) $driver->id) {
                throw new WorkforceException('This ride is planned for another driver.', 403);
            }

            if ($vehicle->status !== Vehicle::STATUS_ACTIVE) {
                throw new WorkforceException(sprintf('%s is retired.', $vehicle->plate));
            }

            $busy = $this->busyWith($vehicle, CarbonImmutable::instance($ride->departs_at), $ride);
            if ($busy !== null) {
                throw new WorkforceException(sprintf('%s is busy then: %s.', $vehicle->plate, $busy));
            }

            if ($this->ridingCount($ride) === 0) {
                throw new WorkforceException('Nobody is riding any more.');
            }

            $ride->update([
                'status' => StaffRide::STATUS_CLAIMED,
                'driver_id' => $driver->id,
                'vehicle_id' => $vehicle->id,
                'claimed_at' => now(),
            ]);

            return $ride;
        });
    }

    /** @throws WorkforceException */
    public function release(StaffRide $ride, User $driver): StaffRide
    {
        $this->mustDrive($ride, $driver, [StaffRide::STATUS_CLAIMED]);
        // A run from the day's plan stays with the planned driver (only the car is given back);
        // otherwise it would drop into the pool while the day still names them.
        $planned = $ride->site_day_id !== null ? SiteDay::query()->whereKey($ride->site_day_id)->value('driver_id') : null;
        $ride->update(['status' => StaffRide::STATUS_REQUESTED, 'driver_id' => $planned, 'vehicle_id' => null, 'claimed_at' => null]);

        return $ride;
    }

    /** @throws WorkforceException */
    public function depart(StaffRide $ride, User $driver): StaffRide
    {
        $this->mustDrive($ride, $driver, [StaffRide::STATUS_CLAIMED]);
        $ride->update(['status' => StaffRide::STATUS_DEPARTED, 'departed_at' => now()]);

        return $ride;
    }

    /** @throws WorkforceException */
    public function drop(StaffRide $ride, User $driver, int $riderId, bool $showedUp = true): StaffRide
    {
        $this->mustDrive($ride, $driver, [StaffRide::STATUS_CLAIMED, StaffRide::STATUS_DEPARTED]);
        $row = $ride->riders()->where('user_id', $riderId)->where('status', StaffRideRider::STATUS_RIDING)->first();

        if ($row === null) {
            throw new WorkforceException('That person is not riding.');
        }

        if ($showedUp && $ride->status !== StaffRide::STATUS_DEPARTED) {
            throw new WorkforceException('Set off first.');
        }

        $row->update($showedUp
            ? ['status' => StaffRideRider::STATUS_DROPPED, 'dropped_at' => now()]
            : ['status' => StaffRideRider::STATUS_NO_SHOW]);

        return $ride;
    }

    /** @throws WorkforceException */
    public function finish(StaffRide $ride, User $driver): StaffRide
    {
        $this->mustDrive($ride, $driver, [StaffRide::STATUS_DEPARTED]);

        if ($this->ridingCount($ride) > 0) {
            throw new WorkforceException('Drop everyone off (or mark who did not come) first.');
        }

        $ride->update(['status' => StaffRide::STATUS_DONE, 'finished_at' => now()]);

        return $ride;
    }

    /** @throws WorkforceException */
    public function cancel(StaffRide $ride, User $by): StaffRide
    {
        $this->mustBeOpenBefore($ride, [StaffRide::STATUS_REQUESTED, StaffRide::STATUS_CLAIMED]);

        if ((int) $ride->created_by !== (int) $by->id && ! $this->sites->canManage($by, $ride->site)) {
            throw new WorkforceException('Whoever asked for the ride, or a manager, cancels it.', 403);
        }

        $ride->update(['status' => StaffRide::STATUS_CANCELLED]);

        return $ride;
    }

    /**
     * Make, change or cancel the day's opening and closing rides to match its
     * plan. Rides that set off are left alone; a ride already taken by another
     * driver goes back to the planned one, who picks the car again.
     */
    public function planFor(SiteDay $day): void
    {
        $site = $day->site()->first();
        if ($site === null) {
            return;
        }

        $date = $day->date->toDateString();
        $closedDay = $this->sites->hoursOn($site, $date)['closed'] ?? true;
        $wants = [
            StaffRide::PURPOSE_OPENING => [
                $day->opener_id,
                $this->sites->opensAt($site, $date)?->subMinutes(self::PICKUP_LEAD_MINUTES),
                in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED], true),
            ],
            StaffRide::PURPOSE_CLOSING => [
                $day->closer_id,
                $this->sites->closesAt($site, $date),
                in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED, SiteDay::STATUS_OPEN], true),
            ],
        ];

        DB::transaction(function () use ($day, $site, $closedDay, $wants): void {
            foreach ($wants as $purpose => [$riderId, $at, $stillAhead]) {
                $ride = StaffRide::query()->lockForUpdate()->where('site_day_id', $day->id)->where('purpose', $purpose)
                    ->whereIn('status', [StaffRide::STATUS_REQUESTED, StaffRide::STATUS_CLAIMED])->latest('id')->first();
                $wanted = ! $closedDay && $stillAhead && $day->driver_id !== null && $riderId !== null && $at !== null && $at->greaterThan(now());

                if (! $wanted) {
                    $ride?->update(['status' => StaffRide::STATUS_CANCELLED]);

                    continue;
                }

                $ride ??= StaffRide::create([
                    'stock_location_id' => $site->id,
                    'site_day_id' => $day->id,
                    'purpose' => $purpose,
                    'departs_at' => $at->utc(),
                    'status' => StaffRide::STATUS_REQUESTED,
                    'driver_id' => $day->driver_id,
                    'created_by' => $day->driver_id,
                ]);

                $ride->update(['departs_at' => $at->utc()] + ((int) $ride->driver_id !== (int) $day->driver_id
                    ? ['status' => StaffRide::STATUS_REQUESTED, 'driver_id' => $day->driver_id, 'vehicle_id' => null, 'claimed_at' => null]
                    : []));

                if (! $ride->riders()->where('user_id', $riderId)->exists()) {
                    $ride->riders()->delete();
                    $rider = User::query()->find($riderId);
                    $ride->riders()->create(['user_id' => $riderId, 'drop_off' => $rider?->home_area, 'status' => StaffRideRider::STATUS_RIDING]);
                }
            }
        });
    }

    /** The day's planned rides, by purpose (for the site day card). */
    public function plannedFor(SiteDay $day): Collection
    {
        return StaffRide::query()->where('site_day_id', $day->id)->where('status', '!=', StaffRide::STATUS_CANCELLED)->latest('id')->get()->unique('purpose')
            ->sortBy(fn (StaffRide $ride): int => $ride->purpose === StaffRide::PURPOSE_OPENING ? 0 : 1)
            ->keyBy('purpose');
    }

    public function mayRequest(?User $user, StockLocation $site): bool
    {
        if ($user === null || ! $this->sites->hasShifts($site)) {
            return false;
        }

        if ($this->sites->canManage($user, $site)) {
            return true;
        }

        return SiteDay::query()->where('stock_location_id', $site->id)
            ->whereDate('date', LocalTime::dateOf())
            ->where(fn ($query) => $query->where('opener_id', $user->id)->orWhere('closer_id', $user->id))
            ->exists();
    }

    /**
     * What the car is booked for around that time, or null when it is free.
     */
    public function busyWith(Vehicle $vehicle, CarbonImmutable $at, ?StaffRide $except = null): ?string
    {
        $from = $at->subHours(self::BUSY_HOURS);
        $to = $at->addHours(self::BUSY_HOURS);

        $run = Shipment::query()->where('vehicle_id', $vehicle->id)
            ->where(fn ($query) => $query
                ->whereIn('status', [Workflow::PICKING, Workflow::READY, Workflow::DISPATCHED, Workflow::IN_TRANSIT])
                ->orWhere(fn ($planned) => $planned
                    ->whereIn('status', [Workflow::PENDING_AGREEMENT, Workflow::SCHEDULED])
                    ->whereBetween(DB::raw('coalesce(agreed_scheduled_for, scheduled_for)'), [$from, $to])))
            ->first();
        if ($run !== null) {
            return 'freight '.$run->reference;
        }

        $delivery = Delivery::query()->where('vehicle_id', $vehicle->id)
            ->whereIn('status', [DeliveryService::STATUS_PENDING, DeliveryService::STATUS_DISPATCHED, DeliveryService::STATUS_IN_TRANSIT])
            ->where(fn ($query) => $query
                ->whereIn('status', [DeliveryService::STATUS_DISPATCHED, DeliveryService::STATUS_IN_TRANSIT])
                ->orWhereBetween('scheduled_for', [$from, $to]))
            ->exists();
        if ($delivery) {
            return 'a customer delivery';
        }

        $ride = StaffRide::query()->where('vehicle_id', $vehicle->id)
            ->when($except !== null, fn ($query) => $query->whereKeyNot($except->id))
            ->where(fn ($query) => $query
                ->where('status', StaffRide::STATUS_DEPARTED)
                ->orWhere(fn ($claimed) => $claimed->where('status', StaffRide::STATUS_CLAIMED)->whereBetween('departs_at', [$from, $to])))
            ->exists();

        return $ride ? 'another staff ride' : null;
    }

    /**
     * Rides a driver may take, the ones they have, and today's they finished.
     *
     * @return Collection<int, StaffRide>
     */
    public function forDriver(User $driver): Collection
    {
        return StaffRide::query()->with(['site', 'riders.user', 'vehicle', 'driver'])
            ->where(fn ($query) => $query
                // Open to any driver, or planned for this one.
                ->where(fn ($pool) => $pool->where('status', StaffRide::STATUS_REQUESTED)->where('departs_at', '>', now()->subHours(3))
                    ->where(fn ($whose) => $whose->whereNull('driver_id')->orWhere('driver_id', $driver->id)))
                ->orWhere(fn ($mine) => $mine->where('driver_id', $driver->id)->whereIn('status', [StaffRide::STATUS_CLAIMED, StaffRide::STATUS_DEPARTED]))
                // Today's finished ones too: the driver records their fuel after.
                ->orWhere(fn ($done) => $done->where('driver_id', $driver->id)->where('status', StaffRide::STATUS_DONE)->where('departs_at', '>=', LocalTime::today()->utc())))
            ->orderBy('departs_at')
            ->get();
    }

    /**
     * Rides this person is on, or asked for, or manages (open, and today's done ones).
     *
     * @return Collection<int, StaffRide>
     */
    public function forStaff(User $user): Collection
    {
        $managed = $this->sites->managedBy($user)->pluck('id');

        return StaffRide::query()->with(['site', 'riders.user', 'vehicle', 'driver'])
            ->where(fn ($query) => $query
                ->whereIn('status', StaffRide::OPEN)
                ->orWhere(fn ($today) => $today->where('departs_at', '>=', LocalTime::today()->utc())->where('status', StaffRide::STATUS_DONE)))
            ->where(fn ($query) => $query
                ->whereHas('riders', fn ($rider) => $rider->where('user_id', $user->id))
                ->orWhere('created_by', $user->id)
                ->orWhereIn('stock_location_id', $managed))
            ->orderBy('departs_at')
            ->get();
    }

    /** @return array<string, mixed> */
    public function present(StaffRide $ride, User $viewer): array
    {
        $ride->loadMissing(['site', 'riders.user', 'vehicle', 'driver']);
        $name = fn (?User $user): ?string => $user ? trim($user->first_name.' '.$user->last_name) : null;
        $key = $ride->vehicle_id ? CustodyKey::query()->where('keyable_type', Vehicle::class)->where('keyable_id', $ride->vehicle_id)->first() : null;
        $drives = (int) $ride->driver_id === (int) $viewer->id;
        $manages = $ride->site !== null && $this->sites->canManage($viewer, $ride->site);
        $mine = $ride->riders->firstWhere('user_id', $viewer->id);
        $open = in_array($ride->status, [StaffRide::STATUS_REQUESTED, StaffRide::STATUS_CLAIMED], true);

        return [
            'id' => (int) $ride->id,
            'site' => $ride->site ? ['id' => (int) $ride->site->id, 'name' => $ride->site->name] : null,
            // Wall-clock, no zone (like the shipment slots).
            'departs_at' => LocalTime::wall($ride->departs_at),
            'status' => $ride->status,
            // 'opening' (a pick-up to the site) or 'closing' (home) when the day's plan made it.
            'purpose' => $ride->purpose,
            'note' => $ride->note,
            'driver' => $ride->driver ? ['id' => (int) $ride->driver->id, 'name' => $name($ride->driver)] : null,
            'vehicle' => $ride->vehicle ? ['id' => (int) $ride->vehicle->id, 'name' => $ride->vehicle->name, 'plate' => $ride->vehicle->plate] : null,
            'driver_holds_key' => $key !== null && $ride->driver_id !== null && (int) $key->holder_id === (int) $ride->driver_id,
            'riders' => $ride->riders->map(fn (StaffRideRider $row): array => [
                'id' => (int) $row->user_id,
                'name' => $name($row->user),
                'drop_off' => $row->drop_off,
                'status' => $row->status,
            ])->values()->all(),
            // The fuel recorded for it (an expense finance confirms).
            'fuel' => ($fuel = Expense::query()->where('source_type', StaffRide::class)->where('source_id', $ride->id)->latest('id')->first()) === null ? null : [
                'amount' => (float) $fuel->amount,
                'litres' => $fuel->litres !== null ? (float) $fuel->litres : null,
                'status' => $fuel->status,
                'reject_reason' => $fuel->reject_reason,
            ],
            'can' => [
                'fuel' => $drives && in_array($ride->status, [StaffRide::STATUS_DEPARTED, StaffRide::STATUS_DONE], true)
                    && ($fuel === null || $fuel->status === Expense::STATUS_REJECTED),
                'claim' => $ride->status === StaffRide::STATUS_REQUESTED && (bool) $viewer->is_driver
                    && ($ride->driver_id === null || $drives),
                // A planned ride names its driver before they take it: drive once taken.
                'drive' => $drives && $ride->status !== StaffRide::STATUS_REQUESTED,
                'opt_out' => $open && $mine !== null && $mine->status === StaffRideRider::STATUS_RIDING,
                'cancel' => $open && ((int) $ride->created_by === (int) $viewer->id || $manages),
            ],
        ];
    }

    private function ridingCount(StaffRide $ride): int
    {
        return $ride->riders()->where('status', StaffRideRider::STATUS_RIDING)->count();
    }

    /**
     * @param  array<int, string>  $statuses
     *
     * @throws WorkforceException
     */
    private function mustDrive(StaffRide $ride, User $driver, array $statuses): void
    {
        if ((int) $ride->driver_id !== (int) $driver->id) {
            throw new WorkforceException('This is not your ride.', 403);
        }

        $this->mustBeOpenBefore($ride, $statuses);
    }

    /**
     * @param  array<int, string>  $statuses
     *
     * @throws WorkforceException
     */
    private function mustBeOpenBefore(StaffRide $ride, array $statuses): void
    {
        if (! in_array($ride->status, $statuses, true)) {
            throw new WorkforceException('The ride is past that step.');
        }
    }
}
