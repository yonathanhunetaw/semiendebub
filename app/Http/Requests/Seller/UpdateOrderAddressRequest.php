<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

/** Where an order goes, while its run has not left yet. */
class UpdateOrderAddressRequest extends FormRequest
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
            'delivery_address' => ['nullable', 'required_if:delivery_method,courier', 'string', 'max:500'],
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
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'delivery_address.required_if' => 'Enter where the courier takes it, or choose "Add later".',
            'driver_phone.required_if' => "Enter the driver's phone for a vehicle collection.",
        ];
    }
}
