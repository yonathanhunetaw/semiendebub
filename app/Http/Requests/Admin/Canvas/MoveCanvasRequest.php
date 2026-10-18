<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Canvas;

use Illuminate\Foundation\Http\FormRequest;

/** Moving a canvas into one of the caller's groups; null or absent means General. */
final class MoveCanvasRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['group_id' => ['nullable', 'integer']];
    }
}
