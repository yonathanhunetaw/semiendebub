<?php

declare(strict_types=1);

namespace App\Http\Requests\Storefront;

use Illuminate\Foundation\Http\FormRequest;

/** The online shop's checkout form (OnlineOrderService::checkout): one account per store, one delivery for all. */
class PlaceOnlineOrderRequest extends FormRequest
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
            'stores' => ['required', 'array', 'min:1', 'max:20'],
            'stores.*.store_id' => ['required', 'integer', 'distinct'],
            'stores.*.payment_account_id' => ['required', 'integer'],
            // A courier to an address, or the shopper picks it up in the store.
            'delivery_method' => ['required', 'in:courier,store'],
            'delivery_address' => ['nullable', 'string', 'max:500', 'required_if:delivery_method,courier'],
            // Whoever takes it: the courier calls them, the counter asks for them.
            'recipient_name' => ['required', 'string', 'max:255'],
            'recipient_phone' => ['required', 'string', 'min:7', 'max:32'],
            'delay_agreed' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'stores.*.payment_account_id.required' => 'Choose an account to pay into for every store.',
            'delivery_address.required_if' => 'Where should the courier bring it?',
        ];
    }
}
