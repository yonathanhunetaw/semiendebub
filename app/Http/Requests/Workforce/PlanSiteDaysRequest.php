<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** Who opens and closes a site on each date (SiteDayService::plan). */
class PlanSiteDaysRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'days' => ['required', 'array', 'max:31'],
            'days.*.date' => ['required', 'date_format:Y-m-d', 'distinct'],
            'days.*.opener_id' => ['nullable', 'integer', 'exists:users,id'],
            'days.*.closer_id' => ['nullable', 'integer', 'exists:users,id'],
            'days.*.driver_id' => ['nullable', 'integer', 'exists:users,id'],
        ];
    }
}
