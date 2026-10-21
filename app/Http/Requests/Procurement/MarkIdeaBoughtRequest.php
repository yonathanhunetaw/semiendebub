<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** The order line that buys an approved idea. Who may say so is ProductIdeaService's call. */
class MarkIdeaBoughtRequest extends FormRequest
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
        ];
    }
}
