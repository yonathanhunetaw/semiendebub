<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** Start counting a location. */
class StartStocktakeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'stock_location_id' => ['required', 'integer', 'exists:stock_locations,id'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }
}
