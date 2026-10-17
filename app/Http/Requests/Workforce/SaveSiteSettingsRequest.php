<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** A site's opening grace and its opening / closing checklists. */
class SaveSiteSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'open_grace_minutes' => ['required', 'integer', 'between:0,240'],
            'opening_checklist' => ['array', 'max:15'],
            'opening_checklist.*' => ['string', 'max:120', 'distinct'],
            'closing_checklist' => ['array', 'max:15'],
            'closing_checklist.*' => ['string', 'max:120', 'distinct'],
        ];
    }
}
