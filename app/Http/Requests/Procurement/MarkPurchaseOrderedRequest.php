<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** The approved order went to the supplier (today, or on the date given). */
class MarkPurchaseOrderedRequest extends FormRequest
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
            'ordered_at' => ['nullable', 'date', 'before_or_equal:today'],
        ];
    }
}
