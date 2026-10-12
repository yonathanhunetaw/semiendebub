<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** What arrived on each shipment line, before signing it in. */
class ShipmentReceiptRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'lines' => ['required', 'array', 'min:1'],
            'lines.*.item_variant_id' => ['required', 'integer'],
            'lines.*.received' => ['required', 'integer', 'min:0', 'max:1000000'],
            'lines.*.damaged' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'lines.*.note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
