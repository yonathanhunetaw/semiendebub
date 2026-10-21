<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** Part (or all) of an ordered purchase order line, put on a consignment. */
class AddConsignmentLineRequest extends FormRequest
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
            'purchase_line_id' => ['required', 'integer', 'exists:purchase_lines,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
            'cbm' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'weight_kg' => ['nullable', 'numeric', 'min:0', 'max:10000000'],
        ];
    }
}
