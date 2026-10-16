<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use Carbon\CarbonImmutable;

/**
 * One kind of thing the calendar shows, read live from the module that owns
 * it. Every event comes back in the shape CalendarItem::make() builds.
 */
interface CalendarSource
{
    /** The filter key the page toggles. */
    public function key(): string;

    public function label(): string;

    /** The colour family on the page: primary, tertiary, info, success, warning, error. */
    public function tone(): string;

    /** @return array<int, string> the apps it appears in */
    public function apps(): array;

    /** @return array<int, array<string, mixed>> */
    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array;
}
