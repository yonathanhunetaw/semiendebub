<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** An item's limits at a shelf or Remote Hub, from the item setup page. */
final class SaveItemBinRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // the controller asks StockPermissions::canEditPlanogram for this place
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'max' => ['required', 'integer', 'min:1'],
            'refill' => ['required', 'integer', 'min:0'],
            'critical' => ['required', 'integer', 'min:0'],
            'item_packaging_type_id' => ['nullable', 'integer', 'exists:item_packaging_types,id'],
        ];
    }
}
