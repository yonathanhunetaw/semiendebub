<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** A product someone thinks the business should sell. Who may suggest it, and for which store, is ProductIdeaService's call. */
class SuggestProductIdeaRequest extends FormRequest
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
            'spec' => ['nullable', 'string', 'max:2000'],
            'reason' => ['nullable', 'string', 'max:2000'],
            'target_price' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            'store_id' => ['nullable', 'integer', 'exists:stores,id'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'name.required' => 'Say what the product is.',
        ];
    }
}
