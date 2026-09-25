<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use Illuminate\Foundation\Http\FormRequest;

class StoreShipmentItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'item_variant_id' => ['required', 'integer', 'exists:item_variants,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'cbm' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'weight_kg' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'unit' => ['nullable', 'string', 'max:32'],
            'location' => ['nullable', 'string', 'max:128'],
        ];
    }
}
