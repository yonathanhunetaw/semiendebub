<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

/** Recording the payment for an order waiting in To pay. */
class PayOrderRequest extends FormRequest
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
            'payment_method' => ['required', 'string', 'max:64'],
            'transaction_reference' => ['nullable', 'string', 'max:128'],
        ];
    }
}
