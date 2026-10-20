<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** One seller's (or one customer's) prices for an item in a store, a line per variant; a blank price removes that line. */
final class SaveItemPartyPricesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // global-zone route; admin middleware
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        // The seller route needs a seller and which customers the price is for; the customer route needs a customer.
        $seller = $this->routeIs('admin.items.setup.seller-prices');

        return [
            'seller_id' => $seller ? ['required', 'integer', 'exists:users,id'] : ['nullable'],
            'customer_type' => $seller ? ['required', 'in:business,individual'] : ['nullable'],
            'customer_id' => $seller ? ['nullable'] : ['required', 'integer', 'exists:customers,id'],
            'variants' => ['required', 'array', 'min:1'],
            'variants.*.store_variant_id' => ['required', 'integer'],
            'variants.*.price' => ['nullable', 'numeric', 'min:0'],
            'variants.*.discount_price' => ['nullable', 'numeric', 'min:0', 'lte:variants.*.price'],
            'variants.*.discount_ends_at' => ['nullable', 'date', 'required_with:variants.*.discount_price'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'variants.*.discount_price.lte' => 'A discount price cannot be higher than the price.',
            'variants.*.discount_ends_at.required_with' => 'Say when the discount ends.',
        ];
    }
}
