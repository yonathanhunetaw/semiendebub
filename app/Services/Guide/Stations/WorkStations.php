<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Workforce\Shift;
use App\Models\Workforce\ShiftSwap;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\LocalTime;
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
                'chips' => [['label' => 'Accept your shift', 'tone' => 'info']],
                'actions' => array_values(array_filter([$this->act('accept', 'Accept', "{$p}.shifts.accept", ['shift' => $shift->id], 'post', [], [], 'success')])),
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

        // Everything else in the bell for this person: noted, with the page that handles it.
        $handled = ['accept-keys', 'accept-shifts', 'swap-offers', 'leave-requests', 'swap-approvals'];

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
        ])];
    }
}
