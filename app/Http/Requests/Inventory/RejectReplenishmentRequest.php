<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\StockKeeper\Transfer;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Turning a replenishment proposal down.
 *
 * The reason is required: a rejected proposal is cancelled rather than deleted
 * precisely so the next sweep's suggestion can be read against why the last one
 * was refused.
 */
class RejectReplenishmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        $transfer = $this->route('transfer');

        return $transfer instanceof Transfer
            && ($this->user()?->can('reject', $transfer) ?? false);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'reason' => ['required', 'string', 'min:3', 'max:255'],
        ];
    }
}
