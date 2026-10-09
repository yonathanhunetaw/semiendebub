<?php

declare(strict_types=1);

namespace App\Http\Requests\Customer;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * An admin creating or editing a customer, including their credit: a limit
 * and the days they have to pay. No limit means no credit.
 */
class AdminCustomerRequest extends FormRequest
{
    use CustomerRules {
        customerData as contactData;
    }

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
            'credit_limit' => ['nullable', 'numeric', 'min:0', 'max:999999999'],
            'credit_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'credit_override' => ['nullable', 'boolean'],
        ];
    }

    /** A limit needs days to pay. */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ((float) $this->input('credit_limit') > 0 && (int) $this->input('credit_days') < 1) {
                    $validator->errors()->add('credit_days', 'Give the customer a number of days to pay.');
                }
            },
        ];
    }

    /** @return array<string, mixed> */
    public function customerData(): array
    {
        $data = $this->contactData();

        // Only when the form sent credit, so an edit that leaves it out does
        // not take a customer's credit away. No limit is no credit: the days
        // go with it.
        if ($this->has('credit_limit') && (float) ($data['credit_limit'] ?? 0) <= 0) {
            $data['credit_limit'] = null;
            $data['credit_days'] = null;
        }

        if ($this->has('credit_override')) {
            $data['credit_override'] = (bool) $data['credit_override'];
        }

        return $data;
    }
}
