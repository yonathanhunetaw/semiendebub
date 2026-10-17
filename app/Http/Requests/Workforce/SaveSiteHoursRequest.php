<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** A site's week of opening hours, Sunday (0) to Saturday (6). */
class SaveSiteHoursRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'days' => ['required', 'array', 'size:7'],
            'days.*.weekday' => ['required', 'integer', 'between:0,6', 'distinct'],
            'days.*.closed' => ['required', 'boolean'],
            'days.*.opens_at' => ['nullable', 'date_format:H:i'],
            'days.*.closes_at' => ['nullable', 'date_format:H:i'],
        ];
    }

    public function after(): array
    {
        return [function (Validator $validator): void {
            foreach ((array) $this->input('days', []) as $i => $day) {
                if (! empty($day['closed']) || empty($day['opens_at']) || empty($day['closes_at'])) {
                    continue;
                }

                if ($day['closes_at'] <= $day['opens_at']) {
                    $validator->errors()->add("days.$i.closes_at", 'Closing time must be after opening time.');
                }
            }
        }];
    }
}
