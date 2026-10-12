<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** A location's volume, entered by hand. Empty clears it. */
class SetCapacityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'capacity_cbm' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
        ];
    }
}
