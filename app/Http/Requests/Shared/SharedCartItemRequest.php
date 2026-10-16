<?php

declare(strict_types=1);

namespace App\Http\Requests\Shared;

use Illuminate\Foundation\Http\FormRequest;

/** A customer adding a line, or setting a quantity (0 removes), on a shared cart. */
class SharedCartItemRequest extends FormRequest
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
            'variant_id' => [$this->isMethod('post') ? 'required' : 'nullable', 'integer'],
            'quantity' => ['required', 'integer', 'min:'.($this->isMethod('post') ? 1 : 0), 'max:999'],
        ];
    }
}
