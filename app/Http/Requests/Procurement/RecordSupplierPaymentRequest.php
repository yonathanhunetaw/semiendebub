<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Finance\PaymentAccount;
use App\Models\Procurement\SupplierPayment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A payment procurement made to a supplier, against one installment. */
class RecordSupplierPaymentRequest extends FormRequest
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
            'payable_installment_id' => ['required', 'integer', 'exists:payable_installments,id'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:1000000000'],
            // Required for a foreign currency; the service checks it against the payable.
            'exchange_rate' => ['nullable', 'numeric', 'gt:0', 'max:1000000'],
            'paid_on' => ['required', 'date', 'before_or_equal:today'],
            'method' => ['required', Rule::in(SupplierPayment::METHODS)],
            'payment_account_id' => ['nullable', 'integer', Rule::exists('payment_accounts', 'id')->where('purpose', PaymentAccount::PURPOSE_SETTLEMENT)],
            'reference' => ['nullable', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
