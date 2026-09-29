<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Several manifest lines at once.
 *
 * The Add Items sheet is a multi-select: the seller ticks four SKUs, sets a
 * packaging unit on each and confirms once. One request per line would leave a
 * half-built manifest behind whenever the second call failed.
 */
class StoreShipmentItemsRequest extends FormRequest
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
            'lines' => ['required', 'array', 'min:1', 'max:100'],
            'lines.*.item_variant_id' => ['required', 'integer', 'exists:item_variants,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'lines.*.unit' => ['nullable', 'string', 'max:32'],
            'lines.*.cbm' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'lines.*.weight_kg' => ['nullable', 'numeric', 'min:0', 'max:1000000'],
            'lines.*.location' => ['nullable', 'string', 'max:128'],
        ];
    }
}
