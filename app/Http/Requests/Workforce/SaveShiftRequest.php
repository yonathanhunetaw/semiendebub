<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use App\Models\Workforce\Shift;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A manager drafts or edits a shift (RotaService::save). */
class SaveShiftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'user_id' => ['required', 'integer', 'exists:users,id'],
            'starts_at' => ['required', 'date_format:Y-m-d\TH:i'],
            'ends_at' => ['required', 'date_format:Y-m-d\TH:i', 'after:starts_at'],
            'duty' => ['nullable', Rule::in(Shift::DUTIES)],
        ];
    }
}
