<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Calendar\CalendarEvent;
use App\Models\Calendar\CalendarEventCompletion;
use App\Models\Document\Document;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Calendar\Recurrence;
use Carbon\CarbonImmutable;

/**
 * The calendar's own entries (reminders, bills, shifts, meetings), each
 * repeating one expanded into its occurrences, each ticked-off occurrence
 * marked done.
 */
class EntrySource implements CalendarSource
{
    /** Kinds whose untouched past occurrence is late (a bill not paid), not just past. */
    private const LATE_KINDS = [CalendarEvent::KIND_BILL, CalendarEvent::KIND_REMINDER];

    public function __construct(private readonly Recurrence $recurrence)
    {
    }

    public function key(): string
    {
        return 'entries';
    }

    public function label(): string
    {
        return 'Reminders & bills';
    }

    public function tone(): string
    {
        return 'success';
    }

    public function apps(): array
    {
        return \App\Services\Calendar\CalendarScope::APPS;
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $entries = CalendarEvent::query()
            ->visibleTo($scope->viewer, $scope->entryStoreIds)
            ->aliveBetween($from, $to)
            ->with([
                'creator:id,first_name,last_name',
                'store:id,name',
                'completions' => fn ($q) => $q
                    ->whereBetween('occurs_on', [$from->subDays(1)->toDateString(), $to->toDateString()])
                    ->with('completer:id,first_name,last_name'),
            ])
            ->limit(500)
            ->get();

        $events = [];
        foreach ($entries as $entry) {
            $done = $entry->completions->keyBy(fn (CalendarEventCompletion $c): string => $c->occurs_on->toDateString());

            foreach ($this->recurrence->between($entry, $from, $to) as $hit) {
                $day = $hit['start']->toDateString();
                $events[] = $this->present($scope, $entry, $hit['start'], $hit['end'], $done->get($day));
            }
        }

        return $events;
    }

    /** @return array<string, mixed> */
    public function present(CalendarScope $scope, CalendarEvent $entry, CarbonImmutable $start, ?CarbonImmutable $end, ?CalendarEventCompletion $completion): array
    {
        $day = $start->toDateString();
        $state = $completion !== null
            ? CalendarItem::DONE
            : CalendarItem::openState($entry->all_day ? $start->endOfDay() : ($end ?? $start), in_array($entry->kind, self::LATE_KINDS, true));

        return CalendarItem::make(
            id: "entry:{$entry->id}:{$day}",
            source: $this->key(),
            kind: (string) $entry->kind,
            title: (string) $entry->title,
            start: $start,
            end: $end,
            allDay: (bool) $entry->all_day,
            state: $state,
            status: $completion !== null ? ($entry->kind === CalendarEvent::KIND_BILL ? 'paid' : 'done') : null,
            subtitle: $entry->counterparty,
            url: null,
            amount: $completion?->amount ?? $entry->amount,
            currency: $entry->currency,
            extra: [
                'entry' => [
                    'id' => (int) $entry->id,
                    'occurs_on' => $day,
                    'notes' => $entry->notes,
                    'visibility' => (string) $entry->visibility,
                    'store' => $entry->store?->name,
                    'repeat' => (string) $entry->repeat,
                    'repeat_every' => (int) $entry->repeat_every,
                    'repeat_until' => $entry->repeat_until?->toDateString(),
                    'starts_at' => $entry->starts_at->toIso8601String(),
                    'ends_at' => $entry->ends_at?->toIso8601String(),
                    'amount' => $entry->amount === null ? null : (float) $entry->amount,
                    'counterparty' => $entry->counterparty,
                    'created_by' => trim(($entry->creator?->first_name ?? '').' '.($entry->creator?->last_name ?? '')) ?: null,
                    'can_edit' => $this->canEdit($scope, $entry),
                    // The receipt it was made from, if any.
                    'document_url' => $entry->source_type === (new Document())->getMorphClass() && $entry->source_id !== null
                        ? CalendarItem::url("{$scope->app}.calendar.documents.show", $entry->source_id)
                        : null,
                    'completion' => $completion === null ? null : [
                        'at' => $completion->completed_at->toIso8601String(),
                        'by' => trim(($completion->completer?->first_name ?? '').' '.($completion->completer?->last_name ?? '')) ?: null,
                        'note' => $completion->note,
                    ],
                ],
            ],
        );
    }

    /** The creator, or an admin whose view covers the entry's store. */
    public function canEdit(CalendarScope $scope, CalendarEvent $entry): bool
    {
        if ((int) $entry->created_by === (int) $scope->viewer->id) {
            return true;
        }

        return $scope->app === 'admin'
            && $entry->visibility === CalendarEvent::VISIBILITY_SHARED
            && ($entry->store_id === null ? $scope->storeIds === null : $scope->covers((int) $entry->store_id));
    }
}
