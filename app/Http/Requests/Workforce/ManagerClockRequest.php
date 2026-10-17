<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** A manager clocks someone in or out by hand (AttendanceService). */
class ManagerClockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'user_id' => ['sometimes', 'required', 'integer', 'exists:users,id'],
            'at' => ['nullable', 'date_format:Y-m-d\TH:i', 'before_or_equal:now'],
            'note' => ['required', 'string', 'max:500'],
        ];
    }
}
