<?php

declare(strict_types=1);

namespace App\Http\Requests\Document;

use App\Models\Calendar\CalendarEvent;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** The bill an uploaded document becomes, as the person checked it. */
class AddDocumentToCalendarRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'title' => ['required', 'string', 'max:160'],
            'paid' => ['required', 'boolean'],
            'date' => ['required', 'date_format:Y-m-d'],
            'amount' => ['nullable', 'numeric', 'min:0', 'max:9999999999'],
            'currency' => ['nullable', 'string', 'size:3'],
            'counterparty' => ['nullable', 'string', 'max:160'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'repeat' => ['required', Rule::in(CalendarEvent::REPEATS)],
            'repeat_every' => ['nullable', 'integer', 'min:1', 'max:365'],
            'visibility' => ['required', Rule::in(CalendarEvent::VISIBILITIES)],
        ];
    }
}
