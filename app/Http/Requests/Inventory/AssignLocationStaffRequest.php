<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Assigning the stock keepers of a location — any number. Staff of a store are
 * staff of its shelf, floor and Remote Hub too. Admin-only.
 */
class AssignLocationStaffRequest extends FormRequest
{
    public function authorize(): bool
    {
        return in_array($this->user()?->roleKey(), ['admin', 'dev'], true);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'staff_ids' => ['present', 'array'],
            'staff_ids.*' => ['integer', 'distinct', Rule::exists('users', 'id')],
        ];
    }

    /** @return array<int, int> */
    public function staffIds(): array
    {
        return array_values(array_map('intval', (array) $this->validated('staff_ids')));
    }
}
