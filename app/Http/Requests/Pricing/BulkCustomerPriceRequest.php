<?php

declare(strict_types=1);

namespace App\Http\Requests\Pricing;

use Illuminate\Foundation\Http\FormRequest;

/** One store item, one price, for many customers. */
class BulkCustomerPriceRequest extends FormRequest
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
            'customer_ids' => ['required', 'array', 'min:1', 'max:500'],
            'customer_ids.*' => ['integer', 'distinct', 'exists:customers,id'],
            'price' => ['required', 'numeric', 'min:0'],
            'discount_price' => ['nullable', 'numeric', 'min:0', 'lte:price'],
            'discount_ends_at' => ['nullable', 'date'],
        ];
    }
}
