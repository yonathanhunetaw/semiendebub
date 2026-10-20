<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** One store's prices for an item, from the item setup page: every variant's row at once. */
final class SaveItemPricesRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // the route is behind the admin middleware; the controller scopes the rows to the item and store
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'variants' => ['required', 'array', 'min:1'],
            'variants.*.store_variant_id' => ['required', 'integer'],
            'variants.*.price' => ['required', 'numeric', 'min:0'],
            'variants.*.discount_price' => ['nullable', 'numeric', 'min:0', 'lte:variants.*.price'],
            'variants.*.discount_ends_at' => ['nullable', 'date', 'required_with:variants.*.discount_price'],
            'variants.*.individual_price' => ['nullable', 'numeric', 'min:0'],
            'variants.*.on_sale' => ['nullable', 'boolean'],
            'variants.*.business_pool' => ['nullable', 'integer', 'min:0', 'max:10000000'],
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
