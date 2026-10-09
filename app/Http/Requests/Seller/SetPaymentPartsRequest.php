<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

/** Splitting (or re-splitting) an order waiting in To pay. */
class SetPaymentPartsRequest extends FormRequest
{
    use ValidatesPaymentParts;

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
            ...$this->partRules(),
            'parts' => ['required', 'array', 'min:1', 'max:20'],
        ];
    }
}
