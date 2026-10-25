<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** The ETB value at or above which only a global admin approves a purchase order. */
class SetApprovalLimitRequest extends FormRequest
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
            'limit' => ['required', 'numeric', 'gt:0', 'max:1000000000'],
        ];
    }
}
