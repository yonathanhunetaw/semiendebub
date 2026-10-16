<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin\Store;

use App\Models\Store\Store;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Adding or editing a store from Admin → Stores (global admins only, by route). */
final class StoreFacilityRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        $store = $this->route('store');

        return [
            'name' => ['required', 'string', 'max:255', Rule::unique('stores', 'name')->ignore($store instanceof Store ? $store->id : null)],
            'location' => ['nullable', 'string', 'max:255'],
            'manager' => ['nullable', 'string', 'max:255'],
            'status' => ['sometimes', 'in:active,inactive'],
        ];
    }
}
