<?php

declare(strict_types=1);

namespace App\Http\Requests\Pricing;

use Illuminate\Foundation\Http\FormRequest;

/** One customer's own prices on many store items; a blank price removes it. */
class CustomerItemPricesRequest extends FormRequest
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
            'rows' => ['required', 'array', 'min:1', 'max:2000'],
            'rows.*.store_variant_id' => ['required', 'integer', 'distinct'],
            'rows.*.price' => ['nullable', 'numeric', 'min:0'],
            'rows.*.discount_price' => ['nullable', 'numeric', 'min:0'],
            'rows.*.discount_ends_at' => ['nullable', 'date'],
        ];
    }
}
