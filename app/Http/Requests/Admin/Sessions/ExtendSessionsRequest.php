<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Sessions;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Grants one, several or all sessions a fresh lifetime of `minutes` from now.
 * `ids` is only meaningful on the "extend selected" endpoint.
 */
final class ExtendSessionsRequest extends FormRequest
{
    /** One year, so a typo can't mint effectively immortal sessions. */
    public const MAX_MINUTES = 525600;

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
            'minutes' => ['required', 'integer', 'min:1', 'max:'.self::MAX_MINUTES],
            'ids' => ['sometimes', 'array'],
            'ids.*' => ['required', 'string'],
        ];
    }
}
