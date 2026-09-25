<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

class AdjustStockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * A counted quantity of zero is legitimate — that is what an empty bin
     * looks like after a recount.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'counted_quantity' => ['required', 'integer', 'min:0', 'max:1000000'],
            'min_stock_level' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
