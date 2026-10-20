<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Inventory\StockLocation;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;

/**
 * Shifts from the rota: your own on the seller, stock keeper and delivery
 * apps (and everyone's at the sites you manage); on admin, the shifts of the stores in
 * view. Drafts show only to managers. Approved leave shows as whole days,
 * yours and (for managers) your people's.
 */
class ShiftSource implements CalendarSource
{
    public function __construct(private readonly Sites $sites)
    {
    }

    public function key(): string
    {
        return 'shifts';
    }

    public function label(): string
    {
        return 'Shifts';
    }

    public function tone(): string
    {
        return 'info';
    }

    public function apps(): array
    {
        return ['admin', 'seller', 'stock_keeper', 'delivery'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $viewer = $scope->viewer;
        $managedSites = $this->sites->managedBy($viewer)
            ->filter(fn (StockLocation $site): bool => $scope->app !== 'admin' || $site->store_id === null || $scope->covers((int) $site->store_id))
            ->values();
        $managed = $managedSites->pluck('id')->all();

        $shifts = Shift::query()->with(['user', 'site'])
            ->where('status', '!=', Shift::STATUS_CANCELLED)
            ->where('starts_at', '<', $to)
            ->where('ends_at', '>', $from)
            ->where(fn ($query) => $query
                ->whereIn('stock_location_id', $managed)
                ->orWhere(fn ($own) => $own->where('user_id', $viewer->id)->where('status', '!=', Shift::STATUS_DRAFT)))
            ->orderBy('starts_at')
            ->limit(1000)
            ->get();

        $people = $managedSites->flatMap(fn (StockLocation $site) => $this->sites->people($site))->pluck('id')->push($viewer->id)->unique()->all();
        $leave = LeaveRequest::query()->with('user')
            ->whereIn('user_id', $people)
            ->where('status', LeaveRequest::STATUS_APPROVED)
            ->overlapping($from->toDateString(), $to->toDateString())
            ->get()
            ->map(fn (LeaveRequest $request): array => CalendarItem::make(
                id: "leave:{$request->id}",
                source: $this->key(),
                kind: 'leave',
                title: ((int) $request->user_id === (int) $viewer->id ? 'My leave' : ($request->user?->first_name ?? 'Leave').' on leave'),
                start: CarbonImmutable::parse($request->starts_on->toDateString()),
                end: CarbonImmutable::parse($request->ends_on->toDateString())->addDay(),
                allDay: true,
                state: CalendarItem::UPCOMING,
                status: $request->type,
                subtitle: ucfirst($request->type).' leave',
                url: CalendarItem::url("{$scope->app}.work"),
            ))->all();

        // An open swap on a shift: offered to a colleague, or taken and waiting for a manager.
        $swaps = ShiftSwap::query()->with('to:id,first_name')
            ->whereIn('shift_id', $shifts->pluck('id'))
            ->whereIn('status', ShiftSwap::OPEN)
            ->get()
            ->keyBy('shift_id');

        return [...$leave, ...$shifts->map(function (Shift $shift) use ($scope, $viewer, $swaps): array {
            $swap = $swaps->get($shift->id);
            $mine = (int) $shift->user_id === (int) $viewer->id;
            $start = CarbonImmutable::instance($shift->starts_at);
            $end = CarbonImmutable::instance($shift->ends_at);
            $duty = match ($shift->duty) {
                Shift::DUTY_OPENER => ' · opens',
                Shift::DUTY_CLOSER => ' · closes',
                default => '',
            };

            return CalendarItem::make(
                id: "shift:{$shift->id}",
                source: $this->key(),
                kind: 'shift',
                title: ($mine ? 'My shift' : ($shift->user?->first_name ?? 'Shift')).' '.LocalTime::wall($start, 'H:i').'–'.LocalTime::wall($end, 'H:i'),
                start: $start,
                end: $end,
                allDay: false,
                state: $end->isPast() ? CalendarItem::DONE : CalendarItem::UPCOMING,
                status: $shift->status,
                subtitle: ($shift->site?->name ?? '').$duty.match ($shift->status) {
                    Shift::STATUS_DRAFT => ' · draft',
                    Shift::STATUS_PUBLISHED => ' · not accepted yet',
                    Shift::STATUS_CHANGE_REQUESTED => ' · change asked',
                    default => '',
                }.match ($swap?->status) {
                    ShiftSwap::STATUS_OFFERED => ' · swap offered to '.($swap->to?->first_name ?? 'a colleague'),
                    ShiftSwap::STATUS_TAKEN => ' · swap waiting for a manager',
                    default => '',
                },
                url: $mine ? CalendarItem::url("{$scope->app}.work") : CalendarItem::url("{$scope->app}.work.rota", ['site' => $shift->stock_location_id, 'week' => LocalTime::dateOf($start)]),
            );
        })->values()->all()];
    }
}
