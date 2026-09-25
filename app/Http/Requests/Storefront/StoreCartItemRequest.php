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
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'variant_id' => ['required', 'integer', 'exists:item_variants,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:' . config('storefront.max_line_quantity', 999)],
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
}
