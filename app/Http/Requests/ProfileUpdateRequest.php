<?php

namespace App\Http\Requests;

use App\Models\Auth\User;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ProfileUpdateRequest extends FormRequest
{
    /**
     * Validate against the columns this application actually has.
     *
     * The generated version required a `name` field; the users table has
     * `first_name` / `last_name` and no `name` at all, so every profile update
     * failed validation on a field that could never be supplied.
     *
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'first_name' => ['required', 'string', 'max:255'],
            'last_name' => ['nullable', 'string', 'max:255'],
            'email' => [
                'required',
                'string',
                'lowercase',
                'email',
                'max:255',
                Rule::unique(User::class)->ignore($this->user()->id),
            ],
            'phone_number' => [
                'nullable',
                'string',
                'max:15',
                Rule::unique(User::class, 'phone_number')->ignore($this->user()->id),
            ],
        ];
    }
}
