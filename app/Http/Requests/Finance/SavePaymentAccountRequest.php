<?php

declare(strict_types=1);

namespace App\Http\Requests\Finance;

use App\Models\Auth\User;
use App\Models\Finance\PaymentAccount;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A payment account the admin is adding or editing. */
class SavePaymentAccountRequest extends FormRequest
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
        $providers = config('payments.providers', []);

        return [
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'type' => ['required', Rule::in([PaymentAccount::TYPE_BANK, PaymentAccount::TYPE_WALLET])],
            'provider' => [
                'required',
                'string',
                Rule::in(array_keys($providers)),
                // A wallet provider cannot hold a bank account, and back.
                function (string $attribute, mixed $value, Closure $fail) use ($providers): void {
                    if (($providers[$value]['type'] ?? null) !== $this->input('type')) {
                        $fail('That provider does not offer this kind of account.');
                    }
                },
            ],
            'account_number' => ['required', 'string', 'max:64'],
            'account_name' => ['required', 'string', 'max:255'],
            'owner_user_id' => [
                'required',
                'integer',
                'exists:users,id',
                // Owners confirm deposits in the seller app.
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! User::query()->find($value)?->hasRole('seller')) {
                        $fail('The owner must be a seller: they confirm deposits in the seller app.');
                    }
                },
            ],
            'purpose' => ['required', Rule::in([PaymentAccount::PURPOSE_COLLECTION, PaymentAccount::PURPOSE_SETTLEMENT])],
            'is_active' => ['required', 'boolean'],
            // For a settlement account: the sellers who hand money over to it.
            // Never its owner, who would be confirming their own handover.
            'remitter_ids' => ['nullable', 'array'],
            'remitter_ids.*' => [
                'integer',
                'distinct',
                'exists:users,id',
                Rule::notIn([(int) $this->input('owner_user_id')]),
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (! User::query()->find($value)?->hasRole('seller')) {
                        $fail('Only sellers hand money over.');
                    }
                },
            ],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'remitter_ids.*.not_in' => 'The owner cannot hand money over to their own account.',
        ];
    }

    /** The account's own columns. */
    public function accountData(): array
    {
        return collect($this->validated())->except('remitter_ids')->all();
    }

    /** @return array<int, int> Sellers who remit here; none unless it is a settlement account. */
    public function remitterIds(): array
    {
        if ($this->validated('purpose') !== PaymentAccount::PURPOSE_SETTLEMENT) {
            return [];
        }

        return array_map('intval', $this->validated('remitter_ids') ?? []);
    }
}
