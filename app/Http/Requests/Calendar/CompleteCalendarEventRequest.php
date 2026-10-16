<?php

declare(strict_types=1);

namespace App\Http\Requests\Calendar;

use Carbon\CarbonImmutable;
use Illuminate\Foundation\Http\FormRequest;

/** Tick off (or reopen) one occurrence of a calendar entry. */
class CompleteCalendarEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'occurs_on' => ['required', 'date_format:Y-m-d'],
            'done' => ['required', 'boolean'],
            'amount' => ['nullable', 'numeric', 'min:0'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }

    public function day(): CarbonImmutable
    {
        return CarbonImmutable::createFromFormat('Y-m-d', (string) $this->input('occurs_on'))->startOfDay();
    }
}
