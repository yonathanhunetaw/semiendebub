<?php

declare(strict_types=1);

namespace App\Http\Requests\Finance;

use Illuminate\Foundation\Http\FormRequest;

/**
 * A seller handing held money over. No `from` account means cash. Whether
 * the seller holds that much and may use that settlement account is
 * RemittanceService's to check.
 */
class StoreRemittanceRequest extends FormRequest
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
            'from_payment_account_id' => ['nullable', 'integer', 'exists:payment_accounts,id'],
            'to_payment_account_id' => ['required', 'integer', 'exists:payment_accounts,id'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'reference' => ['nullable', 'string', 'max:128'],
        ];
    }
}
