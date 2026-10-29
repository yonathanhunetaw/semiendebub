<?php

declare(strict_types=1);

namespace App\Http\Requests\Vendor;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A business asking to open a store on Duka (public, no account yet). */
class ApplyVendorRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'business_name' => ['required', 'string', 'max:120'],
            'contact_first_name' => ['required', 'string', 'max:80'],
            'contact_last_name' => ['nullable', 'string', 'max:80'],
            // Taken emails and phones are refused here, not at approval, so the business can fix them.
            'email' => ['required', 'email', 'max:255', Rule::unique('users', 'email'),
                Rule::unique('vendor_applications', 'email')->where('status', 'pending')],
            'phone_number' => ['required', 'string', 'max:15', Rule::unique('users', 'phone_number')],
            'city' => ['nullable', 'string', 'max:80'],
            'tin_number' => ['nullable', 'string', 'max:40'],
            'description' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'email.unique' => 'That email already has an account or a waiting application.',
            'phone_number.unique' => 'That phone number already has an account.',
        ];
    }
}
