<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use Illuminate\Foundation\Http\FormRequest;

/** A manager gives a key to someone without the holder (KeyCustodyService::force). */
class ForceKeyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'to_id' => ['required', 'integer', 'exists:users,id'],
            'note' => ['required', 'string', 'max:500'],
        ];
    }
}
