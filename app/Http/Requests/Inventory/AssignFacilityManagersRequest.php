<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\Warehouse;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Appointing the one or two users who oversee a warehouse.
 *
 * The ceiling is validated rather than silently truncated — being handed three
 * names means the caller believes three people can manage it, and the business
 * rule is that two can.
 */
class AssignFacilityManagersRequest extends FormRequest
{
    public function authorize(): bool
    {
        $warehouse = $this->route('warehouse');

        return $warehouse instanceof Warehouse
            && ($this->user()?->can('assignManagers', $warehouse) ?? false);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            // An empty array is legitimate: it leaves the warehouse admin-only.
            'manager_ids' => ['present', 'array'],
            'manager_ids.*' => ['integer', 'distinct', 'exists:users,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'manager_ids.*.distinct' => 'The same user cannot be listed twice.',
        ];
    }

    /** @return array<int, int> primary first */
    public function managerIds(): array
    {
        return array_values(array_map('intval', (array) $this->validated()['manager_ids']));
    }
}
