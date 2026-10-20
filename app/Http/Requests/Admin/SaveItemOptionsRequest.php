<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** An item's colours, sizes and packaging (with pieces per pack): the matrix its variants are made from. */
final class SaveItemOptionsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // global-zone route; admin middleware
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'color_ids' => ['nullable', 'array'],
            'color_ids.*' => ['nullable'],
            'size_ids' => ['nullable', 'array'],
            'size_ids.*' => ['nullable'],
            'packaging' => ['nullable', 'array'],
            'packaging.*.item_packaging_type_id' => ['required'],
            'packaging.*.quantity' => ['required', 'integer', 'min:1'],
        ];
    }
}
