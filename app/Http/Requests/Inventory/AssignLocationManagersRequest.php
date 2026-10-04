<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\FacilityManager;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Appointing the managers of a location — a store (all of it), a Store Shelf,
 * a store floor, a Remote Hub, Main Hub A or B — each with their tick boxes.
 * Any number of managers. Admin-only: a manager cannot add a colleague or
 * change their own ticks.
 *
 * Accepts `managers: [{user_id, abilities: [...]}]`, primary first. The older
 * `manager_ids: [...]` form is still accepted and keeps (or, for someone new,
 * grants every) tick.
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
        if ($this->has('manager_ids') && ! $this->has('managers')) {
            return [
                // Empty is legitimate: the location is then run by role, as before.
                'manager_ids' => ['present', 'array'],
                'manager_ids.*' => ['integer', 'distinct', 'exists:users,id'],
            ];
        }

        return [
            'managers' => ['present', 'array'],
            'managers.*.user_id' => ['required', 'integer', 'distinct', 'exists:users,id'],
            'managers.*.abilities' => ['present', 'array'],
            // Not `distinct`: it would compare across managers. syncManagers() de-duplicates.
            'managers.*.abilities.*' => ['string', Rule::in(FacilityManager::ABILITIES)],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'manager_ids.*.distinct' => 'The same person cannot be listed twice.',
            'managers.*.user_id.distinct' => 'The same person cannot be listed twice.',
        ];
    }

    /** @return array<int, int> primary first */
    public function managerIds(): array
    {
        if ($this->has('managers')) {
            return array_values(array_map(fn (array $m): int => (int) $m['user_id'], (array) $this->validated('managers')));
        }

        return array_values(array_map('intval', (array) $this->validated('manager_ids')));
    }

    /** @return array<int, array<int, string>> tick boxes per user id; empty when the old form was used */
    public function abilities(): array
    {
        if (! $this->has('managers')) {
            return [];
        }

        $abilities = [];

        foreach ((array) $this->validated('managers') as $manager) {
            $abilities[(int) $manager['user_id']] = array_values((array) $manager['abilities']);
        }

        return $abilities;
    }
}
