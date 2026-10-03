<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\FacilityManager;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Appointing the one or two managers of a location — a Store Shelf, a store
 * floor, a Remote Hub, Main Hub A or B. Admin-only: a manager cannot add a
 * colleague or replace themselves.
 */
class AssignLocationManagersRequest extends FormRequest
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
            // Empty is legitimate: the location is then run by role, as before.
            'manager_ids' => ['present', 'array', 'max:'.FacilityManager::MAX_PER_FACILITY],
            'manager_ids.*' => ['integer', 'distinct', 'exists:users,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'manager_ids.max' => 'A location may have at most '.FacilityManager::MAX_PER_FACILITY.' managers.',
            'manager_ids.*.distinct' => 'The same person cannot fill both manager slots.',
        ];
    }

    /** @return array<int, int> primary first */
    public function managerIds(): array
    {
        return array_values(array_map('intval', (array) $this->validated()['manager_ids']));
    }
}
