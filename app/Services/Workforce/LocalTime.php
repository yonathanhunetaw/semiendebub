<?php

declare(strict_types=1);

namespace App\Services\Workforce;

use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;

/**
 * The shops' clock (config app.business_timezone, Addis Ababa).
 *
 * The app runs in UTC, but people type and read wall-clock times: "opens at
 * 08:30", "shift 09:00–17:00", "ride at 19:15". Those mean the shops' time.
 * Here they become real UTC instants for the database and for comparing
 * with now(), and instants become the shops' wall clock for the screens.
 * Calendar dates ("today", a weekday, a leave day) are the shops' dates too.
 */
final class LocalTime
{
    public static function zone(): string
    {
        return (string) config('app.business_timezone', 'UTC');
    }

    /** Now on the shops' clock. */
    public static function now(): CarbonImmutable
    {
        return CarbonImmutable::now(self::zone());
    }

    /** Today on the shops' clock, at midnight there. */
    public static function today(): CarbonImmutable
    {
        return self::now()->startOfDay();
    }

    /** The shops' calendar date of an instant (or of now), "Y-m-d". */
    public static function dateOf(?CarbonInterface $instant = null): string
    {
        return ($instant === null ? self::now() : CarbonImmutable::instance($instant)->setTimezone(self::zone()))->toDateString();
    }

    /**
     * The shops' date meant by a date argument: a "Y-m-d" string or a date at
     * midnight is that date; any other moment (now(), say) is an instant, read
     * on the shops' clock.
     */
    public static function dateText(CarbonInterface|string $date): string
    {
        if (is_string($date)) {
            return substr($date, 0, 10);
        }

        return $date->format('H:i:s') === '00:00:00' ? $date->toDateString() : self::dateOf($date);
    }

    /** A date as a local midnight (its weekday is the shops' weekday). */
    public static function day(CarbonInterface|string $date): CarbonImmutable
    {
        return CarbonImmutable::parse(self::dateText($date), self::zone())->startOfDay();
    }

    /** "2026-10-19" + "08:30" on the shops' clock, as a UTC instant. */
    public static function at(CarbonInterface|string $date, string $time): CarbonImmutable
    {
        return CarbonImmutable::parse(self::dateText($date).' '.$time, self::zone())->utc();
    }

    /** A typed wall-clock ("2026-10-19T08:30" or "2026-10-19 08:30") as a UTC instant. */
    public static function parse(string $wallClock): CarbonImmutable
    {
        return CarbonImmutable::parse(str_replace('T', ' ', $wallClock), self::zone())->utc();
    }

    /** Local midnight at the start of a shops' date, as a UTC instant. */
    public static function startOf(CarbonInterface|string $date): CarbonImmutable
    {
        return self::day($date)->utc();
    }

    /** An instant on the shops' clock, formatted ("Y-m-d\TH:i" for inputs, "H:i" for times). */
    public static function wall(?CarbonInterface $instant, string $format = 'Y-m-d\TH:i'): ?string
    {
        return $instant === null ? null : CarbonImmutable::instance($instant)->setTimezone(self::zone())->format($format);
    }
}
