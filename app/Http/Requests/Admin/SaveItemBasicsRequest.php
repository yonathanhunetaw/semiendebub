<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** An item's own details: name, description, packaging notes, category (an id or a new name) and status. */
final class SaveItemBasicsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // global-zone route; admin middleware
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'product_name' => ['required', 'string', 'max:255'],
            'product_description' => ['nullable', 'string'],
            'packaging_details' => ['nullable', 'string'],
            // Its customs tariff (Procurement → Tariffs); digits, dots and spaces.
            'hs_code' => ['nullable', 'string', 'max:20', 'regex:/^[0-9 .]+$/'],
            'item_category_id' => ['required'],
            'status' => ['required', 'in:draft,active,inactive,archived'],
        ];
    }
}
