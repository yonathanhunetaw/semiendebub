<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\RefillRequest;
use Illuminate\Foundation\Http\FormRequest;

/** Turn down or withdraw a refill escalation before anything has left. */
class CancelRefillRequest extends FormRequest
{
    public function authorize(): bool
    {
        $leg = $this->route('refillRequest');

        return $leg instanceof RefillRequest && ($this->user()?->can('cancel', $leg) ?? false);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'reason' => ['nullable', 'string', 'max:255'],
        ];
    }
}
