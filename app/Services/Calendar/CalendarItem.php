<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use Carbon\CarbonImmutable;

/**
 * The one shape every calendar event takes on the wire.
 *
 * `state` is what the page colours by: upcoming, done, late (past and not
 * done, where the module knows), past (gone by, the module can't tell) or
 * cancelled.
 */
final class CalendarItem
{
    public const UPCOMING = 'upcoming';

    public const DONE = 'done';

    public const LATE = 'late';

    public const PAST = 'past';

    /**
     * @param  array<string, mixed>  $extra
     * @return array<string, mixed>
     */
    public static function make(
        string $id,
        string $source,
        string $kind,
        string $title,
        CarbonImmutable $start,
        ?CarbonImmutable $end,
        bool $allDay,
        string $state,
        ?string $status = null,
        ?string $subtitle = null,
        ?string $url = null,
        mixed $amount = null,
        ?string $currency = null,
        array $extra = [],
    ): array {
        return [
            'id' => $id,
            'source' => $source,
            'kind' => $kind,
            'title' => $title,
            'subtitle' => $subtitle,
            'start' => $allDay ? $start->toDateString() : $start->toIso8601String(),
            'end' => $end === null ? null : ($allDay ? $end->toDateString() : $end->toIso8601String()),
            'all_day' => $allDay,
            'state' => $state,
            'status' => $status,
            'url' => $url,
            'amount' => $amount === null ? null : (float) $amount,
            'currency' => $currency,
        ] + $extra;
    }

    /** Upcoming or late by the clock, for a record that is not finished. */
    public static function openState(CarbonImmutable $when, bool $knowsLate = true): string
    {
        if ($when->isFuture() || $when->isToday()) {
            return self::UPCOMING;
        }

        return $knowsLate ? self::LATE : self::PAST;
    }

    /** A route URL, or null when the route is not registered (an app without that page). */
    public static function url(string $name, mixed $parameters = []): ?string
    {
        return \Illuminate\Support\Facades\Route::has($name) ? route($name, $parameters) : null;
    }
}
