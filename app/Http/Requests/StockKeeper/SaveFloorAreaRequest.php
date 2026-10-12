<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** An area on a floor, in metres from the top-left corner. */
class SaveFloorAreaRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'code' => ['required', 'string', 'max:20'],
            'name' => ['nullable', 'string', 'max:255'],
            'kind' => ['nullable', 'string', 'max:20'],
            'x' => ['required', 'numeric', 'min:0', 'max:1000'],
            'y' => ['required', 'numeric', 'min:0', 'max:1000'],
            'width' => ['required', 'numeric', 'min:0.1', 'max:1000'],
            'length' => ['required', 'numeric', 'min:0.1', 'max:1000'],
            'notes' => ['nullable', 'string', 'max:500'],
        ];
    }
}
