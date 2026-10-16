<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\Calendar\CalendarEvent;
use Carbon\CarbonImmutable;

/**
 * The occurrences of a calendar entry that touch a range.
 *
 * Every occurrence is counted from the first one, never from the one before
 * it, so a bill due on the 31st falls on the 30th in a 30-day month and is
 * back on the 31st the month after (no drift).
 */
class Recurrence
{
    /** A runaway series (daily for years, a range of months) stops here. */
    private const MAX_OCCURRENCES = 400;

    /**
     * @return array<int, array{start: CarbonImmutable, end: CarbonImmutable|null}>
     */
    public function between(CalendarEvent $event, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $first = $event->starts_at->toImmutable();
        $length = $event->ends_at !== null ? max(0, $event->ends_at->getTimestamp() - $first->getTimestamp()) : null;

        if (! $event->repeats()) {
            $end = $length === null ? null : $first->addSeconds($length);

            return $this->touches($first, $end, $from, $to) ? [['start' => $first, 'end' => $end]] : [];
        }

        $every = max(1, (int) $event->repeat_every);
        $until = $event->repeat_until?->endOfDay();
        $last = $until !== null && $until->lt($to) ? $until : $to;

        $occurrences = [];
        for ($n = $this->firstIndex($event->repeat, $every, $first, $from, $length); count($occurrences) < self::MAX_OCCURRENCES; $n++) {
            $start = $this->nth($event->repeat, $every, $first, $n);
            if ($start->gt($last)) {
                break;
            }

            $end = $length === null ? null : $start->addSeconds($length);
            if ($this->touches($start, $end, $from, $to)) {
                $occurrences[] = ['start' => $start, 'end' => $end];
            }
        }

        return $occurrences;
    }

    /** The day of the next occurrence on or after $day, or null when the series is over. */
    public function nextOnOrAfter(CalendarEvent $event, CarbonImmutable $day): ?CarbonImmutable
    {
        $hits = $this->between($event, $day->startOfDay(), $day->addYears(2)->endOfDay());

        return $hits === [] ? null : $hits[0]['start'];
    }

    /** Is $day the start of one of the entry's occurrences? */
    public function occursOn(CalendarEvent $event, CarbonImmutable $day): bool
    {
        foreach ($this->between($event, $day->startOfDay(), $day->endOfDay()) as $hit) {
            if ($hit['start']->isSameDay($day)) {
                return true;
            }
        }

        return false;
    }

    private function nth(string $repeat, int $every, CarbonImmutable $first, int $n): CarbonImmutable
    {
        $steps = $n * $every;

        return match ($repeat) {
            CalendarEvent::REPEAT_DAILY => $first->addDays($steps),
            CalendarEvent::REPEAT_WEEKLY => $first->addWeeks($steps),
            CalendarEvent::REPEAT_MONTHLY => $first->addMonthsNoOverflow($steps),
            CalendarEvent::REPEAT_YEARLY => $first->addYearsNoOverflow($steps),
            default => $first,
        };
    }

    /** Skip the occurrences that end before the range (one step early, to be safe). */
    private function firstIndex(string $repeat, int $every, CarbonImmutable $first, CarbonImmutable $from, ?int $length): int
    {
        $reach = $from->subSeconds($length ?? 0);
        if ($reach->lte($first)) {
            return 0;
        }

        $units = match ($repeat) {
            CalendarEvent::REPEAT_DAILY => $first->diffInDays($reach),
            CalendarEvent::REPEAT_WEEKLY => $first->diffInWeeks($reach),
            CalendarEvent::REPEAT_MONTHLY => $first->diffInMonths($reach),
            CalendarEvent::REPEAT_YEARLY => $first->diffInYears($reach),
            default => 0,
        };

        return max(0, (int) floor($units / $every) - 1);
    }

    private function touches(CarbonImmutable $start, ?CarbonImmutable $end, CarbonImmutable $from, CarbonImmutable $to): bool
    {
        return $start->lte($to) && ($end ?? $start)->gte($from);
    }
}
