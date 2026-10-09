<?php

declare(strict_types=1);

namespace App\Http\Requests\Customer;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A seller creating or editing a customer.
 *
 * Credit is for an admin to give: a seller's request carrying any credit
 * field is refused outright, not quietly ignored.
 */
class SellerCustomerRequest extends FormRequest
{
    use CustomerRules;

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $customer = $this->route('customer');

        return [
            ...$this->contactRules($customer !== null ? (int) (is_object($customer) ? $customer->id : $customer) : null),
            'credit_limit' => ['prohibited'],
            'credit_days' => ['prohibited'],
            'credit_override' => ['prohibited'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'credit_limit.prohibited' => 'Only an admin can give a customer credit.',
            'credit_days.prohibited' => 'Only an admin can give a customer credit.',
            'credit_override.prohibited' => 'Only an admin can give a customer credit.',
        ];
    }
}
