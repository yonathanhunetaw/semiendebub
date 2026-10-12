<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** Taking a transfer in, optionally with what actually arrived. */
class CompleteTransferRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'received' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'damaged' => ['nullable', 'integer', 'min:0', 'lte:received'],
        ];
    }
}
