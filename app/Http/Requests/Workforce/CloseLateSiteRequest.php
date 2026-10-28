<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** A manager closing a day nobody closed (SiteDayService::closeLate). */
class CloseLateSiteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            // When the shop really closed, on the shops' clock: "2026-10-19T19:30".
            'closed_at' => ['required', 'date_format:Y-m-d\TH:i'],
            'till_count' => ['nullable', 'numeric', 'min:0'],
            'note' => ['required', 'string', 'max:500'],
        ];
    }
}
