<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\RefillRequest;
use Illuminate\Foundation\Http\FormRequest;

/** The Remote Hub agrees to send an approved refill; a courier then carries it. */
class AcceptRefillRequest extends FormRequest
{
    public function authorize(): bool
    {
        $leg = $this->route('refillRequest');

        return $leg instanceof RefillRequest && ($this->user()?->can('accept', $leg) ?? false);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }
}
