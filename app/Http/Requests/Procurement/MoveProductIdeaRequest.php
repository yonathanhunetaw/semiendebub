<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Procurement\ProductIdea;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Move a product idea on. Whether this person may, and what the step needs, is ProductIdeaService's call. */
class MoveProductIdeaRequest extends FormRequest
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
            'to' => ['required', 'string', Rule::in(ProductIdea::STATUSES)],
            'note' => ['nullable', 'string', 'max:1000'],
            'target_price' => ['nullable', 'numeric', 'min:0', 'max:1000000000'],
            // Sending it to price check: the check to open.
            'store_id' => ['nullable', 'integer', 'exists:stores,id'],
            'shops_wanted' => ['nullable', 'integer', 'min:1', 'max:50'],
            'due_on' => ['nullable', 'date_format:Y-m-d'],
            'assignee_ids' => ['nullable', 'array', 'max:50'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
            'check_note' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
