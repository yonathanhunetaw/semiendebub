<?php

declare(strict_types=1);

namespace App\Http\Requests\Guide;

use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

/** The day (or range of days) the Live Operations world replays. */
class WorldShipmentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        // The route group's role gate decides who may open the world.
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'from' => ['nullable', 'date'],
            'to' => ['nullable', 'date', 'after_or_equal:from'],
            'shelf' => ['nullable', 'boolean'],
            'play' => ['nullable', 'boolean'],
            'catalogue' => ['nullable', 'boolean'],
        ];
    }

    /** The start of the first shops' day asked for (local midnight, as a UTC instant). */
    public function from(): CarbonImmutable
    {
        return LocalTime::startOf($this->filled('from') ? (string) $this->input('from') : LocalTime::today());
    }

    /** The end of the last shops' day asked for, at most a month on. */
    public function to(): CarbonImmutable
    {
        $end = $this->filled('to')
            ? LocalTime::startOf((string) $this->input('to'))->addDay()->subSecond()
            : $this->from()->addDay()->subSecond();

        return CarbonImmutable::createFromTimestamp(min($end->getTimestamp(), $this->from()->addDays(31)->getTimestamp()));
    }
}
