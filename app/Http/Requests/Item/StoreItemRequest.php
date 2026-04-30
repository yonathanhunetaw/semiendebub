<?php

namespace App\Http\Requests\Item;

use Illuminate\Foundation\Http\FormRequest;

class StoreItemRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return false;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'product_name' => 'required|string|max:255',
            'product_description' => 'nullable|string',
            'item_category_id' => 'required|exists:item_categories,id',
            'status' => 'required|in:active,inactive',
            'general_images' => 'nullable|array',
            'color_ids' => 'array', // Many-to-many
            'size_ids' => 'array',  // Many-to-many
            'packaging' => 'array', // Pivot with quantity
            'packaging.*.id' => 'required|exists:item_packaging_types,id',
            'packaging.*.quantity' => 'required|integer|min:1',
        ];
    }
}
