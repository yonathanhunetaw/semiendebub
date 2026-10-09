<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

/** Turning a cart into an order, with how the customer will pay. No parts is "pay later". */
class PlaceOrderRequest extends FormRequest
{
    use ValidatesPaymentParts;

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
            ...$this->partRules(),
            'delivery_address' => ['nullable', 'string', 'max:500'],
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'recipient_phone' => ['nullable', 'string', 'max:32'],
            'delay_agreed' => ['nullable', 'boolean'],
        ];
    }
}
