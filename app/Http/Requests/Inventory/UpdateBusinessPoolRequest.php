<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use Illuminate\Foundation\Http\FormRequest;

/** How many units of a store item are kept for Business customers; null removes the split. */
class UpdateBusinessPoolRequest extends FormRequest
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
            'business_pool' => ['nullable', 'integer', 'min:0', 'max:10000000'],
        ];
    }
}
