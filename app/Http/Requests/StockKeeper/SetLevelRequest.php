<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/**
 * An item's lines at a warehouse-class location: full, low stock, crit low,
 * in one of the item's pack units. Order is checked by LocationLevels.
 */
class SetLevelRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'item_packaging_type_id' => ['nullable', 'integer', 'exists:item_packaging_types,id'],
            'max' => ['required', 'integer', 'min:1', 'max:1000000'],
            'low' => ['required', 'integer', 'min:0', 'max:1000000'],
            'critical' => ['required', 'integer', 'min:0', 'max:1000000'],
        ];
    }
}
