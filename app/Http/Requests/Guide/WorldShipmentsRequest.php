<?php

declare(strict_types=1);

namespace App\Http\Requests\Guide;

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
        ];
    }

    public function from(): CarbonImmutable
    {
        return $this->filled('from') ? CarbonImmutable::parse((string) $this->input('from'))->startOfDay() : CarbonImmutable::now()->startOfDay();
    }

    public function to(): CarbonImmutable
    {
        $to = $this->filled('to') ? CarbonImmutable::parse((string) $this->input('to')) : $this->from();

        // At most a month at a time.
        return CarbonImmutable::createFromTimestamp(min($to->endOfDay()->getTimestamp(), $this->from()->addDays(31)->getTimestamp()));
    }
}
