<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\StockKeeper\Transfer;
use Illuminate\Foundation\Http\FormRequest;

/**
 * A store manager's ruling on an automated replenishment proposal.
 *
 * The quantity is adjustable because approval is the first moment a person
 * looks at the suggestion: a manager who knows only twenty will fit on the
 * shelf approves twenty, rather than rejecting and re-raising by hand.
 */
class ApproveReplenishmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $transfer = $this->route('transfer');

        return $transfer instanceof Transfer
            && ($this->user()?->can('approve', $transfer) ?? false);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'quantity' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }

    public function approvedQuantity(): ?int
    {
        $quantity = $this->input('quantity');

        return $quantity === null || $quantity === '' ? null : (int) $quantity;
    }
}
