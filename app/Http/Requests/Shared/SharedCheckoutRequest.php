<?php

declare(strict_types=1);

namespace App\Http\Requests\Shared;

use Illuminate\Foundation\Http\FormRequest;

/** A customer checking out a shared cart: where it goes and which account they pay into. */
class SharedCheckoutRequest extends FormRequest
{
    /** The link itself is checked by the controller. */
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
            // A courier to an address, or the customer picks it up in the store.
            'delivery_method' => ['required', 'in:courier,store'],
            'customer_address_id' => ['nullable', 'integer'],
            'delivery_address' => ['nullable', 'string', 'max:500', 'required_if:delivery_method,courier'],
            'recipient_name' => ['nullable', 'string', 'max:255'],
            'recipient_phone' => ['nullable', 'string', 'max:32', 'required_if:delivery_method,courier'],
            'payment_account_id' => ['required', 'integer'],
            'delay_agreed' => ['nullable', 'boolean'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'delivery_address.required_if' => 'Where should we deliver it?',
            'recipient_phone.required_if' => 'A phone number for the courier.',
            'payment_account_id.required' => 'Choose the account you will pay into.',
        ];
    }
}
