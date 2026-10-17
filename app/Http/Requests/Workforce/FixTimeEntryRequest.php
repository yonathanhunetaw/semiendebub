<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** A manager corrects a clock row (AttendanceService::fix). */
class FixTimeEntryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'clock_in_at' => ['required', 'date_format:Y-m-d\TH:i'],
            'clock_out_at' => ['nullable', 'date_format:Y-m-d\TH:i', 'after:clock_in_at'],
            'note' => ['required', 'string', 'max:500'],
        ];
    }
}
