<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\PublicHoliday;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffRide;
use App\Models\Workforce\TimeEntry;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\OvertimeService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use App\Services\Workforce\StaffRideService;
use App\Services\Workforce\SwapService;
use App\Services\Workforce\WorkTasks;

/**
 * The Staff & keys desk: the Work area's tasks for this person, on every app
 * (one shared set of routes, `{app}.work.*`): keys handed to them to accept,
 * shifts to accept, shifts a colleague offered, and for a manager the leave
 * and swaps to decide. The rest of the bell's work tasks are listed as notes
 * with the page that handles them (rota gaps, overtime, rides, clock-outs).
 */
class WorkStations
{
    use BuildsStations;

    public function __construct(
        private readonly KeyCustodyService $keys,
        private readonly LeaveService $leave,
        private readonly SwapService $swaps,
        private readonly WorkTasks $tasks,
        private readonly AttendanceService $attendance,
        private readonly StaffRideService $rides,
        private readonly OvertimeService $overtime,
        private readonly Sites $sites,
        private readonly SiteDayService $days,
    ) {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        if (! in_array($app, ['admin', 'seller', 'stock_keeper', 'delivery'], true)) {
            return [];
        }

        $p = "{$app}.work";
        $note = [['name' => 'note', 'label' => 'Note (optional)', 'type' => 'text']];
        $items = [];

        foreach ($this->keys->waitingFor($viewer) as $handover) {
            $items[] = [
                'id' => 'key-'.$handover->id,
                'title' => 'Key: '.($handover->key?->label() ?? 'a key'),
                'subtitle' => 'Handed to you by '.$this->person($handover->from),
                'chips' => [['label' => 'Accept once it is in your hand', 'tone' => 'warning']],
                'actions' => array_values(array_filter([
                    $this->act('accept', 'I have it', "{$p}.key-handovers.accept", ['handover' => $handover->id], 'post', [], [], 'success'),
                    $this->act('reject', 'Not mine', "{$p}.key-handovers.reject", ['handover' => $handover->id], 'post', [], [['name' => 'note', 'label' => 'Why', 'type' => 'text', 'required' => true]], 'inherit'),
                ])),
            ];
        }

        foreach (Shift::query()->with('site')->where('user_id', $viewer->id)->where('status', Shift::STATUS_PUBLISHED)->where('ends_at', '>', now())->orderBy('starts_at')->limit(5)->get() as $shift) {
            $items[] = [
                'id' => 'shift-'.$shift->id,
                'title' => 'Shift at '.($shift->site?->name ?? 'the site'),
                'subtitle' => LocalTime::wall($shift->starts_at, 'D j M H:i').' to '.LocalTime::wall($shift->ends_at, 'H:i'),
                'chips' => [['label' => $shift->accepted_at === null ? 'Accept your shift' : 'Accepted', 'tone' => 'info']],
                'actions' => array_values(array_filter([
                    $shift->accepted_at === null ? $this->act('accept', 'Accept', "{$p}.shifts.accept", ['shift' => $shift->id], 'post', [], [], 'success') : null,
                    $this->act('offer', 'Offer it to a colleague', "{$p}.shifts.offer", ['shift' => $shift->id], 'post', [], [$this->colleagues($viewer, $shift), ...$note], 'primary'),
                    $this->act('change', 'Ask for a change', "{$p}.shifts.change", ['shift' => $shift->id], 'post', [], [['name' => 'note', 'label' => 'What needs to change', 'type' => 'text', 'required' => true]], 'inherit'),
                ])),
            ];
        }

        // Offers this person made that are still open: they can take them back.
        foreach (ShiftSwap::query()->with(['shift.site', 'to'])->where('from_id', $viewer->id)->whereIn('status', [ShiftSwap::STATUS_OFFERED, ShiftSwap::STATUS_TAKEN])->limit(5)->get() as $swap) {
            $items[] = [
                'id' => 'myoffer-'.$swap->id,
                'title' => 'You offered a shift to '.$this->person($swap->to),
                'subtitle' => ($swap->shift?->site?->name ?? '').' · '.($swap->shift ? LocalTime::wall($swap->shift->starts_at, 'D j M H:i') : ''),
                'chips' => [['label' => $swap->status === ShiftSwap::STATUS_TAKEN ? 'Taken: a manager decides' : 'Waiting for them', 'tone' => 'info']],
                'actions' => array_values(array_filter([$this->act('cancel', 'Take it back', "{$p}.swaps.cancel", ['swap' => $swap->id], 'post', [], [], 'inherit')])),
            ];
        }

        foreach (ShiftSwap::query()->with(['shift.site', 'from'])->where('to_id', $viewer->id)->where('status', ShiftSwap::STATUS_OFFERED)->limit(5)->get() as $swap) {
            $items[] = [
                'id' => 'offer-'.$swap->id,
                'title' => $this->person($swap->from).' offers you a shift',
                'subtitle' => ($swap->shift?->site?->name ?? '').' · '.($swap->shift ? LocalTime::wall($swap->shift->starts_at, 'D j M H:i') : ''),
                'actions' => array_values(array_filter([
                    $this->act('take', 'Take it', "{$p}.swaps.take", ['swap' => $swap->id], 'post', [], [], 'success'),
                    $this->act('decline', 'Decline', "{$p}.swaps.decline", ['swap' => $swap->id], 'post', [], $note, 'inherit'),
                ])),
            ];
        }

        foreach ($this->leave->awaiting($viewer) as $leave) {
            $items[] = [
                'id' => 'leave-'.$leave->id,
                'title' => $this->person($leave->user).' asks for '.$leave->type.' leave',
                'subtitle' => $leave->starts_on->toDateString().' to '.$leave->ends_on->toDateString(),
                'lines' => array_values(array_filter([$leave->note])),
                'chips' => [['label' => 'To decide', 'tone' => 'warning']],
                'actions' => array_values(array_filter([
                    $this->act('approve', 'Approve', "{$p}.leave.approve", ['leave' => $leave->id], 'post', [], $note, 'success'),
                    $this->act('reject', 'Turn down', "{$p}.leave.reject", ['leave' => $leave->id], 'post', [], $note, 'inherit'),
                ])),
            ];
        }

        foreach ($this->swaps->awaiting($viewer) as $swap) {
            $items[] = [
                'id' => 'swap-'.$swap->id,
                'title' => 'Swap: '.$this->person($swap->from).' → '.$this->person($swap->to),
                'subtitle' => ($swap->shift?->site?->name ?? '').' · '.($swap->shift ? LocalTime::wall($swap->shift->starts_at, 'D j M H:i') : ''),
                'chips' => [['label' => 'Both agreed: you approve', 'tone' => 'warning']],
                'actions' => array_values(array_filter([
                    $this->act('approve', 'Approve the swap', "{$p}.swaps.approve", ['swap' => $swap->id], 'post', [], [], 'success'),
                    $this->act('reject', 'Turn down', "{$p}.swaps.reject", ['swap' => $swap->id], 'post', [], $note, 'inherit'),
                ])),
            ];
        }

        // Leave: ask for some, or take back a request still open.
        $items[] = [
            'id' => 'ask-leave',
            'title' => 'Ask for leave',
            'subtitle' => 'Your manager decides; your shifts in those days are cancelled once it is approved.',
            'actions' => array_values(array_filter([$this->act('ask', 'Ask for leave', "{$p}.leave.store", [], 'post', [], [
                ['name' => 'type', 'label' => 'Kind', 'type' => 'select', 'default' => LeaveRequest::TYPES[0], 'options' => array_map(fn (string $t): array => ['value' => $t, 'label' => ucfirst($t)], LeaveRequest::TYPES)],
                ['name' => 'starts_on', 'label' => 'From (YYYY-MM-DD)', 'type' => 'text', 'required' => true, 'default' => LocalTime::today()->toDateString()],
                ['name' => 'ends_on', 'label' => 'To (YYYY-MM-DD)', 'type' => 'text', 'required' => true, 'default' => LocalTime::today()->toDateString()],
                ['name' => 'note', 'label' => 'Note (optional)', 'type' => 'text'],
            ], 'primary')])),
        ];

        foreach (LeaveRequest::query()->where('user_id', $viewer->id)->where('status', LeaveRequest::STATUS_REQUESTED)->orderBy('starts_on')->limit(5)->get() as $mine) {
            $items[] = [
                'id' => 'myleave-'.$mine->id,
                'title' => 'Your '.$mine->type.' leave is waiting for a decision',
                'subtitle' => $mine->starts_on->toDateString().' to '.$mine->ends_on->toDateString(),
                'actions' => array_values(array_filter([$this->act('cancel', 'Take it back', "{$p}.leave.cancel", ['leave' => $mine->id], 'post', [], [], 'inherit')])),
            ];
        }

        // At the counter: opening and closing the site and clocking in/out. The code on the counter screen proves they are there.
        $code = [['name' => 'token', 'label' => 'Code on the counter screen', 'type' => 'text', 'required' => true]];
        $entry = $this->attendance->openEntry($viewer);
        foreach ($this->sites->workedAtBy($viewer)->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site))->take(6) as $site) {
            $day = $this->days->day($site, now());
            $here = $entry !== null && (int) $entry->stock_location_id === (int) $site->id;
            $onBreak = $here && $entry->breaks()->whereNull('ended_at')->exists();
            $state = match ($day->status) {
                SiteDay::STATUS_OPEN => ['Open', 'success'],
                SiteDay::STATUS_CLOSED => ['Closed for today', 'default'],
                SiteDay::STATUS_MISSED => ['Not opened on time', 'warning'],
                SiteDay::STATUS_CLOSED_DAY => ['Closed day', 'default'],
                default => ['Waiting to open', 'info'],
            };
            $chips = [['label' => $state[0], 'tone' => $state[1]]];
            if ($here) {
                $chips[] = ['label' => $onBreak ? 'On a break' : 'Clocked in since '.LocalTime::wall($entry->clock_in_at, 'H:i'), 'tone' => $onBreak ? 'warning' : 'success'];
            }
            $items[] = [
                'id' => 'site-'.$site->id,
                'title' => $site->name,
                'subtitle' => 'Type the code from the counter screen: it proves you are at the site.',
                'chips' => $chips,
                'actions' => array_values(array_filter([
                    in_array($day->status, [SiteDay::STATUS_PLANNED, SiteDay::STATUS_MISSED], true)
                        ? $this->act('open', 'Open the site', "{$p}.sites.open", ['site' => $site->id], 'post', [], [...$code, ['name' => 'float_amount', 'label' => 'Till float (optional)', 'type' => 'number'], ...$note], 'success') : null,
                    $day->status === SiteDay::STATUS_OPEN
                        ? $this->act('close', 'Close the site', "{$p}.sites.close", ['site' => $site->id], 'post', [], [...$code, ['name' => 'till_count', 'label' => 'Till count (optional)', 'type' => 'number'], ...$note], 'primary', 'Close the site for today?') : null,
                    ! $here && $entry === null ? $this->act('clock-in', 'Clock in', "{$p}.clock-in", ['site' => $site->id], 'post', [], $code, 'primary') : null,
                    $here ? $this->act('clock-out', 'Clock out', "{$p}.clock-out", ['site' => $site->id], 'post', [], $code, 'inherit') : null,
                    $here && ! $onBreak ? $this->act('break-start', 'Start a break', "{$p}.break.start", [], 'post', [], [], 'inherit') : null,
                    $here && $onBreak ? $this->act('break-end', 'Back from the break', "{$p}.break.end", [], 'post', [], [], 'success') : null,
                ])),
            ];
        }

        // Staff rides: the ones a driver may take or has, with what the ride allows next.
        if ($app === 'delivery' || $viewer->is_driver) {
            $cars = Vehicle::query()->orderBy('name')->limit(40)->get(['id', 'name', 'plate']);
            foreach ($this->rides->forDriver($viewer) as $ride) {
                $row = $this->rides->present($ride, $viewer);
                $items[] = [
                    'id' => 'ride-'.$ride->id,
                    'title' => 'Staff ride · '.($ride->site?->name ?? 'a site'),
                    'subtitle' => $row['departs_at'].' · '.count($row['riders']).' rider(s)'.($row['vehicle'] ? ' · '.$row['vehicle']['plate'] : ''),
                    'chips' => [['label' => ucfirst((string) $ride->status), 'tone' => 'info']],
                    'actions' => array_values(array_filter([
                        $row['can']['claim'] ? $this->act('claim', 'Take this ride', "{$p}.rides.claim", ['ride' => $ride->id], 'post', [], [
                            ['name' => 'vehicle_id', 'label' => 'Car', 'type' => 'select', 'required' => true, 'options' => $cars->map(fn (Vehicle $c): array => ['value' => (int) $c->id, 'label' => trim($c->name.' '.$c->plate)])->all()],
                        ], 'success') : null,
                        $row['can']['drive'] && $ride->status === StaffRide::STATUS_CLAIMED ? $this->act('depart', 'Set off', "{$p}.rides.depart", ['ride' => $ride->id], 'post', [], [], 'primary') : null,
                        $row['can']['drive'] && $ride->status === StaffRide::STATUS_DEPARTED ? $this->act('finish', 'Ride done', "{$p}.rides.finish", ['ride' => $ride->id], 'post', [], [], 'success') : null,
                        $row['can']['fuel'] ? $this->act('fuel', 'Record the fuel', "{$p}.rides.fuel", ['ride' => $ride->id], 'post', [], [
                            ['name' => 'amount', 'label' => 'Amount paid', 'type' => 'number', 'required' => true],
                            ['name' => 'litres', 'label' => 'Litres (optional)', 'type' => 'number'],
                        ], 'inherit') : null,
                    ])),
                ];
            }
        }

        // Overtime a manager decides: days in the last two weeks over the line, in their sites.
        $managed = $this->sites->managedBy($viewer);
        if ($managed->isNotEmpty() && $this->overtime->settings()->needs_approval) {
            $days = collect($this->overtime->forSites($managed, LocalTime::today()->subDays(14), LocalTime::today()))
                ->filter(fn (array $day): bool => $day['status'] === 'pending' && $this->overtime->mayDecide($viewer, (int) $day['user_id'], (string) $day['date']))
                ->take(8);
            foreach ($days as $day) {
                $who = ['user_id' => (int) $day['user_id'], 'date' => (string) $day['date']];
                $items[] = [
                    'id' => 'overtime-'.$day['user_id'].'-'.$day['date'],
                    'title' => ($day['name'] ?: 'Someone').' worked overtime',
                    'subtitle' => $day['date'].' · '.$day['overtime'].' min over',
                    'chips' => [['label' => 'To decide', 'tone' => 'warning']],
                    'actions' => array_values(array_filter([
                        $this->act('approve', 'Pay it', "{$p}.overtime.approve", [], 'post', $who, $note, 'success'),
                        $this->act('reject', 'Do not pay', "{$p}.overtime.reject", [], 'post', $who, [['name' => 'note', 'label' => 'Why', 'type' => 'text', 'required' => true]], 'inherit'),
                    ])),
                ];
            }
        }

        // Managers: attendance to put right, and the rota's week.
        $managedSites = $this->sites->managedBy($viewer)->filter(fn (StockLocation $site): bool => $this->sites->hasShifts($site))->take(6);
        $isAdmin = $this->sites->isGlobalAdmin($viewer);
        $stamp = ['name' => 'at', 'label' => 'When (YYYY-MM-DDTHH:MM, blank = now)', 'type' => 'text'];
        $why = ['name' => 'note', 'label' => 'Why', 'type' => 'text', 'required' => true];

        if ($managedSites->isNotEmpty()) {
            $entries = TimeEntry::query()->with(['user:id,first_name,last_name', 'site'])
                ->whereIn('stock_location_id', $managedSites->pluck('id'))
                ->where(fn ($q) => $q->where(fn ($open) => $open->whereNull('clock_out_at')->where('clock_in_at', '<', now()->subHours(12)))
                    ->orWhere(fn ($flagged) => $flagged->whereNotNull('clock_out_at')->whereNull('reviewed_at')->whereNotNull('flags')->where('flags', '!=', '[]')->where('clock_in_at', '>=', now()->subDays(14))))
                ->orderByDesc('clock_in_at')
                ->limit(8)
                ->get();
            foreach ($entries as $e) {
                $open = $e->clock_out_at === null;
                $items[] = [
                    'id' => 'entry-'.$e->id,
                    'title' => $this->person($e->user).($open ? ' never clocked out' : ': hours to check'),
                    'subtitle' => ($e->site?->name ?? '').' · in '.LocalTime::wall($e->clock_in_at, 'D j M H:i').($open ? '' : ', out '.LocalTime::wall($e->clock_out_at, 'H:i')),
                    'chips' => [['label' => $open ? 'Still clocked in' : implode(', ', (array) $e->flags), 'tone' => 'warning']],
                    'actions' => array_values(array_filter([
                        $open ? $this->act('clock-out', 'Clock them out', "{$p}.time-entries.clock-out", ['entry' => $e->id], 'post', [], [$stamp, $why], 'primary') : null,
                        $this->act('fix', 'Fix the times', "{$p}.time-entries.fix", ['entry' => $e->id], 'put', [], [
                            ['name' => 'clock_in_at', 'label' => 'In (YYYY-MM-DDTHH:MM)', 'type' => 'text', 'required' => true, 'default' => LocalTime::wall($e->clock_in_at, 'Y-m-d\TH:i')],
                            ['name' => 'clock_out_at', 'label' => 'Out (YYYY-MM-DDTHH:MM)', 'type' => 'text', 'default' => $e->clock_out_at ? LocalTime::wall($e->clock_out_at, 'Y-m-d\TH:i') : ''],
                            $why,
                        ], 'inherit'),
                        ! $open ? $this->act('review', 'Mark as checked', "{$p}.time-entries.review", ['entry' => $e->id], 'post', [], [], 'success') : null,
                    ])),
                ];
            }

            $week = LocalTime::today()->startOfWeek(\Carbon\CarbonImmutable::MONDAY);
            foreach ($managedSites as $site) {
                foreach ([0, 1] as $ahead) {
                    $from = $week->addWeeks($ahead);
                    $drafts = Shift::query()->where('stock_location_id', $site->id)->where('status', Shift::STATUS_DRAFT)
                        ->where('starts_at', '>=', LocalTime::startOf($from))->where('starts_at', '<', LocalTime::startOf($from->addDays(6))->addDay())->count();
                    $label = $ahead === 0 ? 'this week' : 'next week';
                    $items[] = [
                        'id' => 'rota-'.$site->id.'-'.$ahead,
                        'title' => 'Rota: '.$site->name.', '.$label,
                        'subtitle' => $drafts === 0 ? 'No drafts waiting. Drafting stays on the Rota page.' : $drafts.' draft shift(s) not sent yet.',
                        'chips' => $drafts === 0 ? [] : [['label' => 'To publish', 'tone' => 'warning']],
                        'actions' => array_values(array_filter([
                            $drafts > 0 ? $this->act('publish', 'Send the week', "{$p}.rota.publish", ['site' => $site->id], 'post', ['week' => $from->toDateString()], [], 'success', 'Send these shifts to the staff?') : null,
                            $ahead === 1 ? $this->act('copy', 'Copy this week', "{$p}.rota.copy", ['site' => $site->id], 'post', ['week' => $from->toDateString()], [], 'inherit') : null,
                        ])),
                    ];
                }
            }

            $coming = Shift::query()->with(['user:id,first_name,last_name', 'site'])->whereIn('stock_location_id', $managedSites->pluck('id'))
                ->whereIn('status', Shift::LIVE)->where('starts_at', '>', now())->orderBy('starts_at')->limit(6)->get();
            foreach ($coming as $shift) {
                $items[] = [
                    'id' => 'rotashift-'.$shift->id,
                    'title' => $this->person($shift->user).' at '.($shift->site?->name ?? 'the site'),
                    'subtitle' => LocalTime::wall($shift->starts_at, 'D j M H:i').' to '.LocalTime::wall($shift->ends_at, 'H:i').' · '.str_replace('_', ' ', (string) $shift->status),
                    'actions' => array_values(array_filter([$this->act('cancel', 'Cancel the shift', "{$p}.shifts.cancel", ['shift' => $shift->id], 'post', [], [], 'inherit', 'Cancel this shift?')])),
                ];
            }
        }

        // Admin: public holidays (they change opening hours and overtime).
        if ($isAdmin) {
            $items[] = [
                'id' => 'holiday-add',
                'title' => 'Add a public holiday',
                'subtitle' => 'Sites are closed and overtime counts as holiday pay that day.',
                'actions' => array_values(array_filter([$this->act('add', 'Add it', "{$p}.holidays.store", [], 'post', [], [
                    ['name' => 'date', 'label' => 'Date (YYYY-MM-DD)', 'type' => 'text', 'required' => true],
                    ['name' => 'name', 'label' => 'Name', 'type' => 'text', 'required' => true],
                ], 'primary')])),
            ];
            foreach (PublicHoliday::query()->where('date', '>=', LocalTime::today()->toDateString())->orderBy('date')->limit(5)->get() as $holiday) {
                $items[] = [
                    'id' => 'holiday-'.$holiday->id,
                    'title' => $holiday->name,
                    'subtitle' => $holiday->date->toDateString(),
                    'actions' => array_values(array_filter([$this->act('remove', 'Remove', "{$p}.holidays.destroy", ['holiday' => $holiday->id], 'delete', [], [], 'inherit', 'Remove this holiday?')])),
                ];
            }
        }

        // Everything else in the bell for this person: noted, with the page that handles it.
        $handled = ['accept-keys', 'accept-shifts', 'swap-offers', 'leave-requests', 'swap-approvals', 'overtime-to-approve'];

        foreach ($this->tasks->for($viewer) as $task) {
            if (in_array($task['id'], $handled, true)) {
                continue;
            }

            $items[] = ['id' => 'task-'.$task['id'], 'title' => (string) $task['title'], 'subtitle' => (string) $task['detail'], 'chips' => [['label' => (string) $task['count'], 'tone' => $task['urgent'] ? 'warning' : 'info']], 'actions' => []];
        }

        return [$this->station('work', 'Staff & keys', 'desk_work', $items, [
            'blurb' => 'Keys, shifts, leave and swaps: your Work tasks, as the Work page lists them.',
            'empty' => 'Nothing needs you in Work right now.',
            'open' => $this->open('Open My work', "{$p}"),
            'links' => $managedSites->isEmpty() ? [] : array_values(array_filter([
                $this->link('Hours report (last 14 days, CSV)', "{$p}.hours.all", ['from' => LocalTime::today()->subDays(14)->toDateString(), 'to' => LocalTime::today()->toDateString()]),
                $this->link('Rota pages and attendance', "{$p}"),
            ])),
        ])];
    }

    /**
     * The select for "offer it to": colleagues with a shift at the same site.
     *
     * @return array<string, mixed>
     */
    private function colleagues(User $viewer, Shift $shift): array
    {
        $users = User::query()
            ->whereIn('id', Shift::query()->where('stock_location_id', $shift->stock_location_id)->where('user_id', '!=', $viewer->id)->where('ends_at', '>', now())->select('user_id'))
            ->orderBy('first_name')
            ->limit(30)
            ->get(['id', 'first_name', 'last_name']);

        return ['name' => 'to_id', 'label' => 'Offer it to', 'type' => 'select', 'required' => true,
            'options' => $users->map(fn (User $u): array => ['value' => (int) $u->id, 'label' => $this->person($u)])->all()];
    }

    /** @return array{label: string, url: string}|null */
    private function link(string $label, string $route, array $query = []): ?array
    {
        $link = $this->open($label, $route);

        return $link === null ? null : ['label' => $label, 'url' => $link['url'].($query === [] ? '' : '?'.http_build_query($query))];
    }
}
