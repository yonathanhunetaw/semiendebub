<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\RefillRequest;
use Illuminate\Foundation\Http\FormRequest;

/**
 * The store manager puts a suggestion on the Remote Hub → Store list. Sending a
 * different amount than was asked also needs the adjust tick.
 */
class AddRefillToRemoteListRequest extends FormRequest
{
    public function authorize(): bool
    {
        $leg = $this->route('refillRequest');
        $user = $this->user();

        if (! $leg instanceof RefillRequest || $user === null || ! $user->can('addToRemoteList', $leg)) {
            return false;
        }

        $quantity = $this->input('quantity');

        return $quantity === null || $quantity === '' || (int) $quantity === $leg->quantity || $user->can('update', $leg);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'quantity' => ['nullable', 'integer', 'min:1', 'max:1000000'],
        ];
    }
}
