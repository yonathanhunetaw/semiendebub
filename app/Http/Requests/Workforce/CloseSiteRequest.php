<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** Closing a site at the counter (SiteDayService::close). */
class CloseSiteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'token' => ['required', 'string', 'max:64'],
            'ticked' => ['array'],
            'ticked.*' => ['string', 'max:120'],
            'till_count' => ['nullable', 'numeric', 'min:0'],
            // Why the count differs from the day's cash; required by the service when it does.
            'difference_note' => ['nullable', 'string', 'max:500'],
            'note' => ['nullable', 'string', 'max:500'],
            'key_to_id' => ['nullable', 'integer', 'exists:users,id'],
            'clock_out_others' => ['boolean'],
        ];
    }
}
