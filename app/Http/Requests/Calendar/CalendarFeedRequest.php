<?php

declare(strict_types=1);

namespace App\Http\Requests\Calendar;

use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

/** The range (and the sources) the calendar page asks for. */
class CalendarFeedRequest extends FormRequest
{
    /** Enough for a month view's six weeks, or a long agenda. */
    private const MAX_DAYS = 100;

    public function authorize(): bool
    {
        // The route group's role gate decides who may open the calendar.
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'from' => ['required', 'date'],
            'to' => ['required', 'date', 'after_or_equal:from'],
            'sources' => ['nullable', 'array'],
            'sources.*' => ['string', 'max:32'],
        ];
    }

    /*
     * The page asks for the shops' days. The app runs in UTC, so the window
     * covers both the UTC day and the shops' day at each end: a shift at
     * 01:00 Addis (22:00 UTC the day before) is not cut off. Sources get a
     * few extra hours at the edges, which the page never draws.
     */
    public function from(): CarbonImmutable
    {
        $utc = CarbonImmutable::parse((string) $this->input('from'))->startOfDay();
        $shops = LocalTime::startOf((string) $this->input('from'));

        return $shops->lt($utc) ? $shops : $utc;
    }

    public function to(): CarbonImmutable
    {
        $utc = CarbonImmutable::parse((string) $this->input('to'))->endOfDay();
        $shops = LocalTime::startOf((string) $this->input('to'))->addDay()->subSecond();
        $to = $shops->gt($utc) ? $shops : $utc;
        $cap = $this->from()->addDays(self::MAX_DAYS + 1)->endOfDay();

        return $to->gt($cap) ? $cap : $to;
    }

    /** @return array<int, string>|null */
    public function sources(): ?array
    {
        return $this->has('sources') ? array_values((array) $this->input('sources', [])) : null;
    }
}
