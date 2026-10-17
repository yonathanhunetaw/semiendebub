<?php

declare(strict_types=1);

namespace App\Http\Requests\Workforce;

use App\Models\Workforce\KeyHandover;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** The holder hands a key to the next person (KeyCustodyService::handOver). */
class HandOverKeyRequest extends FormRequest
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
            'reason' => ['nullable', 'string', Rule::in(KeyHandover::REASONS)],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
