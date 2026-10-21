<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Services\Workforce\LocalTime;
use Illuminate\Foundation\Http\FormRequest;

/** A price check on an item we already sell. Who may open one, and for which store, is PriceCheckService's call. */
class OpenPriceCheckRequest extends FormRequest
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
            'item_id' => ['required', 'integer', 'exists:items,id'],
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'shops_wanted' => ['nullable', 'integer', 'min:1', 'max:50'],
            'due_on' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:'.LocalTime::dateOf()],
            'assignee_ids' => ['nullable', 'array', 'max:50'],
            'assignee_ids.*' => ['integer', 'exists:users,id'],
            'note' => ['nullable', 'string', 'max:1000'],
        ];
    }
}
