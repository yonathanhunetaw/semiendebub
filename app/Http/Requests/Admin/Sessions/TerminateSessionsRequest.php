<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Sessions;

use Illuminate\Foundation\Http\FormRequest;

final class TerminateSessionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // gated by role.subdomain on the route group
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
            'ids' => ['required', 'array', 'min:1'],
            'ids.*' => ['required', 'string'],
        ];
    }
}
