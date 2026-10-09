<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

/**
 * The shape of an order's payment split, shared by checkout and To pay.
 *
 * A part with an account is money the customer sends to that account; a part
 * without one is cash; a part with method "credit" goes on the customer's
 * credit. Whether the accounts belong to the store and the parts
 * add up to the total is PaymentService's to check, against the real sale.
 */
trait ValidatesPaymentParts
{
    /**
     * @return array<string, mixed>
     */
    protected function partRules(): array
    {
        return [
            'parts' => ['nullable', 'array', 'max:20'],
            'parts.*.payment_account_id' => ['nullable', 'integer', 'exists:payment_accounts,id'],
            // "credit" puts the part on the customer's credit; anything else is
            // an account part (with an account) or cash (without).
            'parts.*.method' => ['nullable', 'string', 'in:credit'],
            'parts.*.amount' => ['required', 'numeric', 'gt:0', 'max:999999999'],
            'parts.*.transaction_reference' => ['nullable', 'string', 'max:128'],
        ];
    }

    /**
     * @return array<int, array{payment_account_id: int|null, method: string|null, amount: float, transaction_reference: string|null}>
     */
    public function parts(): array
    {
        return array_values(array_map(fn (array $part): array => [
            'payment_account_id' => isset($part['payment_account_id']) ? (int) $part['payment_account_id'] : null,
            'method' => $part['method'] ?? null,
            'amount' => (float) $part['amount'],
            'transaction_reference' => $part['transaction_reference'] ?? null,
        ], $this->validated('parts') ?? []));
    }
}
