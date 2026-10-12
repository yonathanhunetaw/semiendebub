<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use Illuminate\Foundation\Http\FormRequest;

/** A hub floor's size in metres. */
class SetFloorSizeRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'width' => ['required', 'numeric', 'min:1', 'max:1000'],
            'length' => ['required', 'numeric', 'min:1', 'max:1000'],
        ];
    }
}
