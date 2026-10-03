<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Placing an order from one of the seller's carts — paid on the spot, or
 * left to pay (its stock is held for a while, then released).
 */
class PlaceOrderRequest extends FormRequest
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
            'cart_id' => ['required', 'integer', 'exists:carts,id'],
            'pay_now' => ['required', 'boolean'],
            'payment_method' => ['nullable', 'required_if:pay_now,true', 'string', 'max:64'],
            'transaction_reference' => ['nullable', 'string', 'max:128'],
            'delivery_address' => ['nullable', 'string', 'max:500'],
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'recipient_phone' => ['nullable', 'string', 'max:32'],
            'delay_agreed' => ['nullable', 'boolean'],
        ];
    }
}
