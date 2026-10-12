<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** One count on a stocktake: a variant (or a scanned code) and the number counted, in the variant's own unit. */
class CountStocktakeLineRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'item_variant_id' => ['nullable', 'integer', 'required_without:code'],
            'code' => ['nullable', 'string', 'max:100', 'required_without:item_variant_id'],
            'counted' => ['required', 'integer', 'min:0', 'max:1000000'],
        ];
    }
}
