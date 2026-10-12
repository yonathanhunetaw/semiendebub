<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** Settle a receiving discrepancy. */
class ResolveDiscrepancyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'resolution' => ['required', 'string', 'in:found,lost,accepted'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
