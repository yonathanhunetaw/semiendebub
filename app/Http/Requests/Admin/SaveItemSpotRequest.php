<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** Put an item's shelf bin on a slot of the racks ("f6c"), or lift it off (empty). The slot itself is checked by ShelfMatrix. */
class SaveItemSpotRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // each route's controller checks the planogram permission
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'spot' => ['nullable', 'string', 'max:8'],
        ];
    }
}
