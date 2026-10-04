<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\StockLocation;
use App\Services\Inventory\StockPermissions;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Assign an item to a shelf, or change its lines: max, refill line, crit low,
 * in one of the item's pack units. Only the shelf's managers (and admins).
 */
class UpdateShelfBandRequest extends FormRequest
{
    public function authorize(): bool
    {
        $shelf = $this->route('location');

        return $shelf instanceof StockLocation
            && app(StockPermissions::class)->canEditPlanogram($this->user(), $shelf);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'item_packaging_type_id' => ['nullable', 'integer', 'exists:item_packaging_types,id'],
            'max' => ['required', 'integer', 'min:1', 'max:100000'],
            'refill' => ['required', 'integer', 'min:0', 'max:100000'],
            'critical' => ['required', 'integer', 'min:0', 'max:100000'],
        ];
    }
}
