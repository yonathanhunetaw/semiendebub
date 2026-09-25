<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

class StoreCartItemRequest extends FormRequest
{
    /**
     * The cart is authorized in the controller via CartPolicy::update, which
     * needs the resolved model.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Note what is absent: `price`.
     *
     * The unit price is now resolved server-side from PriceProvider, so a
     * crafted request can no longer dictate what a line costs. Any `price`
     * the client still posts is ignored.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'variant_id' => ['required', 'integer', 'exists:item_variants,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'extra_pieces' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'extra_piece_price' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'variant_id.exists' => 'That product variant does not exist.',
            'quantity.min' => 'Add at least one unit.',
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
}
