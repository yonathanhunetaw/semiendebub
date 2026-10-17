<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** One date a site is closed or keeps other hours. */
class SaveSiteExceptionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'date' => ['required', 'date_format:Y-m-d'],
            'closed' => ['required', 'boolean'],
            'opens_at' => ['nullable', 'required_if:closed,false', 'date_format:H:i'],
            'closes_at' => ['nullable', 'required_if:closed,false', 'date_format:H:i', 'after:opens_at'],
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
