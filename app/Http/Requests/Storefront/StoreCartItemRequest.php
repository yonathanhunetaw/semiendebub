<?php

declare(strict_types=1);

namespace App\Http\Requests\Storefront;

use Illuminate\Foundation\Http\FormRequest;

class StoreCartItemRequest extends FormRequest
{
    /**
     * The storefront is public: guests and signed-in shoppers may both fill a
     * cart. Ownership is enforced by the cart lookup, not by this gate.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Counts only.
     *
     * Note what is absent, exactly as on the seller's own request:
     * `extra_piece_price`. The rate for a sub-unit is prorated server-side from
     * the pack that was chosen (CartService::proratedSubUnitPrices), so a
     * crafted post cannot decide what a loose piece costs.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $ceiling = (int) config('storefront.max_line_quantity', 999);

        return [
            'variant_id' => ['required', 'integer', 'exists:item_variants,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:' . $ceiling],
            // Loose sub-units topped onto the chosen pack.
            'extra_pieces' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'extra_boxes' => ['nullable', 'integer', 'min:0', 'max:100000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'variant_id.exists' => 'That product is no longer available.',
            'quantity.min' => 'Choose at least one unit.',
        ];
    }

    public function variantId(): int
    {
        return (int) $this->validated('variant_id');
    }

    public function quantity(): int
    {
        return (int) $this->validated('quantity');
    }

    public function extraPieces(): int
    {
        return (int) ($this->validated('extra_pieces') ?? 0);
    }

    public function extraBoxes(): int
    {
        return (int) ($this->validated('extra_boxes') ?? 0);
    }
}
