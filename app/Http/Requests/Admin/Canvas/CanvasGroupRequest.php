<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Canvas;

use Illuminate\Foundation\Http\FormRequest;

/** Naming a canvas group (creating or renaming). */
final class CanvasGroupRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['name' => ['required', 'string', 'max:40']];
    }
}
