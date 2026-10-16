<?php

declare(strict_types=1);

namespace App\Http\Requests\Shared;

use Illuminate\Foundation\Http\FormRequest;

/** "I've sent it": the customer's bank or wallet reference for a transfer. */
class SharedClaimRequest extends FormRequest
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
            'reference' => ['required', 'string', 'min:3', 'max:128'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return ['reference.required' => 'Enter the reference from your bank or wallet receipt.'];
    }
}
