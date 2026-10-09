<?php

declare(strict_types=1);

namespace App\Http\Requests\Item;

use Illuminate\Foundation\Http\FormRequest;

/** Set one status on several items at once, from the admin item list. */
class BulkItemStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>|string>
     */
    public function rules(): array
    {
        return [
            // One page of the list at most.
            'ids' => 'required|array|min:1|max:' . max(ItemIndexRequest::PER_PAGE),
            'ids.*' => 'integer|distinct|exists:items,id',
            'status' => 'required|in:' . implode(',', ItemIndexRequest::STATUSES),
        ];
    }
}
