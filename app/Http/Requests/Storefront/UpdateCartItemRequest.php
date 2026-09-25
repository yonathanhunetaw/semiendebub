<?php

declare(strict_types=1);

namespace App\Http\Requests\Storefront;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCartItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * A quantity of zero is legitimate here: the drawer's "−" stepper uses it
     * to clear the last unit of a line.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'quantity' => ['required', 'integer', 'min:0', 'max:' . config('storefront.max_line_quantity', 999)],
        ];
    }

    public function quantity(): int
    {
        return (int) $this->validated('quantity');
    }
}
