<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** "I did not get the key" (KeyCustodyService::reject). */
class RejectKeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'note' => ['nullable', 'string', 'max:255'],
        ];
    }
}
