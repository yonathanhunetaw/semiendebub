<?php

declare(strict_types=1);

namespace App\Http\Requests\Vendor;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A store's public profile, edited by its owner (or a global admin). */
class UpdateVendorStoreRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $storeId = (int) $this->input('store_id');

        return [
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'description' => ['nullable', 'string', 'max:2000'],
            'contact_phone' => ['nullable', 'string', 'max:40'],
            'contact_email' => ['nullable', 'email', 'max:255'],
            // The public address: lower-case words joined by dashes.
            'slug' => ['required', 'string', 'min:3', 'max:80', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::unique('stores', 'slug')->ignore($storeId)],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['slug.regex' => 'Use lower-case letters, numbers and dashes, e.g. bole-electronics.'];
    }
}
