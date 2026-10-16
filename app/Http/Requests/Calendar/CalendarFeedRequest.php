<?php

declare(strict_types=1);

namespace App\Http\Requests\Calendar;

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

    public function from(): CarbonImmutable
    {
        return CarbonImmutable::parse((string) $this->input('from'))->startOfDay();
    }

    public function to(): CarbonImmutable
    {
        $to = CarbonImmutable::parse((string) $this->input('to'))->endOfDay();
        $cap = $this->from()->addDays(self::MAX_DAYS)->endOfDay();

        return $to->gt($cap) ? $cap : $to;
    }

    /** @return array<int, string>|null */
    public function sources(): ?array
    {
        return $this->has('sources') ? array_values((array) $this->input('sources', [])) : null;
    }
}
