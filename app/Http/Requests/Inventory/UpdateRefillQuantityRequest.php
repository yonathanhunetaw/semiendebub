<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\RefillRequest;
use Illuminate\Foundation\Http\FormRequest;

/** Change a refill escalation's quantity while it still awaits approval. */
class UpdateRefillQuantityRequest extends FormRequest
{
    public function authorize(): bool
    {
        $leg = $this->route('refillRequest');

        return $leg instanceof RefillRequest && ($this->user()?->can('update', $leg) ?? false);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
        ];
    }
}
