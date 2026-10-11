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
            // How it goes: a courier (a delivery user), a fleet vehicle or
            // any plate typed in, and a saved address of the customer's.
            'courier_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists('users', 'id')->where('role', 'delivery')],
            'vehicle_id' => ['nullable', 'integer', \Illuminate\Validation\Rule::exists('vehicles', 'id')->where('status', 'active')],
            'vehicle_plate' => ['nullable', 'string', 'max:32'],
            'customer_address_id' => ['nullable', 'integer', 'exists:customer_addresses,id'],
            // A courier to an address, a vehicle that collects at the store
            // (its plate and driver's phone), or the address comes later.
            'delivery_method' => ['nullable', 'in:courier,vehicle,later'],
            'driver_phone' => ['nullable', 'string', 'max:32', 'required_if:delivery_method,vehicle'],
            'delay_agreed' => ['nullable', 'boolean'],
            // Standard / express are quoted at dispatch, "later" is decided
            // later; only a custom fee is charged now, on top of the order.
            'delivery_option' => ['nullable', 'in:standard,express,later,custom'],
            'delivery_fee' => ['nullable', 'numeric', 'min:0', 'max:1000000', 'required_if:delivery_option,custom'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'driver_phone.required_if' => "Enter the driver's phone for a vehicle collection.",
            'delivery_fee.required_if' => 'Enter the custom delivery fee.',
        ];
    }
}
