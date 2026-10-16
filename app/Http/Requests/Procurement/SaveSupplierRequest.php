<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A supplier procurement is adding or editing. */
class SaveSupplierRequest extends FormRequest
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
            'name' => ['required', 'string', 'max:255'],
            'country' => ['nullable', 'string', 'max:80'],
            'city' => ['nullable', 'string', 'max:80'],
            'currency' => ['required', Rule::in(config('procurement.currencies', []))],
            'phone' => ['nullable', 'string', 'max:40'],
            'email' => ['nullable', 'email', 'max:255'],
            'address' => ['nullable', 'string', 'max:2000'],
            'contacts' => ['nullable', 'array', 'max:10'],
            'contacts.*.name' => ['required', 'string', 'max:120'],
            'contacts.*.role' => ['nullable', 'string', 'max:80'],
            'contacts.*.phone' => ['nullable', 'string', 'max:40'],
            'contacts.*.email' => ['nullable', 'email', 'max:255'],
            'default_payment_terms' => ['required', Rule::in(array_keys(config('procurement.payment_terms', [])))],
            'default_payment_days' => ['nullable', 'integer', 'min:0', 'max:730', 'required_if:default_payment_terms,fixed_date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['required', 'boolean'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'default_payment_days.required_if' => 'Say how many days after the order the payment is due.',
        ];
    }
}
