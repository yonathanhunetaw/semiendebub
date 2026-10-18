<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** The overtime rules (OvertimeService::saveSettings). */
class SaveOvertimeRulesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'daily_hours' => ['required', 'numeric', 'between:1,16'],
            'rate_day' => ['required', 'numeric', 'between:1,5'],
            'rate_night' => ['required', 'numeric', 'between:1,5'],
            'rate_rest_day' => ['required', 'numeric', 'between:1,5'],
            'rate_holiday' => ['required', 'numeric', 'between:1,5'],
            'night_from' => ['required', 'date_format:H:i'],
            'night_to' => ['required', 'date_format:H:i', 'different:night_from'],
            'rest_weekday' => ['required', 'integer', 'between:0,6'],
            'needs_approval' => ['required', 'boolean'],
        ];
    }
}
