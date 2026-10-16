<?php

declare(strict_types=1);

namespace App\Http\Requests\Calendar;

use App\Models\Calendar\CalendarEvent;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * A calendar entry, new or edited. A new bill may come already paid
 * (`paid_now`): the first occurrence is ticked as it is saved.
 */
class SaveCalendarEventRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Who may edit which entry is checked by the controller.
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:160'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'kind' => ['required', Rule::in(CalendarEvent::KINDS)],
            'visibility' => ['required', Rule::in(CalendarEvent::VISIBILITIES)],
            'starts_at' => ['required', 'date'],
            'ends_at' => ['nullable', 'date'],
            'all_day' => ['required', 'boolean'],
            'repeat' => ['required', Rule::in(CalendarEvent::REPEATS)],
            'repeat_every' => ['nullable', 'integer', 'min:1', 'max:365'],
            'repeat_until' => ['nullable', 'date', 'after_or_equal:starts_at'],
            'amount' => ['nullable', 'numeric', 'min:0', 'max:9999999999'],
            'currency' => ['nullable', 'string', 'size:3'],
            'counterparty' => ['nullable', 'string', 'max:160'],
            'paid_now' => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'repeat_until.after_or_equal' => 'The last repeat cannot be before the first day.',
        ];
    }
}
