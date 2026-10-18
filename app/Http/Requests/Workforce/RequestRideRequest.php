<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** Ask for staff transport from a site (StaffRideService::request). */
class RequestRideRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'departs_at' => ['required', 'date_format:Y-m-d\TH:i'],
            'rider_ids' => ['required', 'array', 'min:1', 'max:30'],
            'rider_ids.*' => ['integer', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
