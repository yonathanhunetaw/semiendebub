<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** The person asks to change a shift (RotaService::requestChange). */
class ShiftChangeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'note' => ['required', 'string', 'max:500'],
        ];
    }
}
