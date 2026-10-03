<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Store\StoreVariant;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Setting min/max capacity for one variant across several locations at once.
 *
 * The screen edits a column of levels — shop floor, back room, remote
 * warehouse, main warehouse — so the payload is a list rather than a pair of
 * fields, and a row with both numbers at zero means "stop monitoring here".
 */
class UpdateVariantCapacityRequest extends FormRequest
{
    public function authorize(): bool
    {
        $variant = $this->route('storeVariant');

        if (! $variant instanceof StoreVariant || $variant->store === null) {
            return false;
        }

        // Capacity drives automated replenishment, so it is a managerial
        // decision about that facility, not general floor access.
        return $this->user()?->can('manageCapacity', $variant->store) ?? false;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'bands' => ['required', 'array', 'min:1', 'max:50'],
            'bands.*.location_type' => ['required', 'string', 'max:255'],
            'bands.*.location_id' => ['required', 'integer', 'min:1'],
            'bands.*.min_capacity' => ['required', 'integer', 'min:0', 'max:1000000'],
            'bands.*.max_capacity' => ['required', 'integer', 'min:0', 'max:1000000'],
        ];
    }

    /**
     * A ceiling below the floor describes a band that can never be satisfied:
     * the planner would top the location up to less than the level that
     * triggered it, and propose again on the next sweep for ever.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                foreach ((array) $this->input('bands', []) as $index => $band) {
                    $min = (int) ($band['min_capacity'] ?? 0);
                    $max = (int) ($band['max_capacity'] ?? 0);

                    if ($min > 0 && $max < $min) {
                        $validator->errors()->add(
                            "bands.{$index}.max_capacity",
                            'Maximum capacity must be at least the minimum.',
                        );
                    }
                }
            },
        ];
    }

    /**
     * @return array<int, array{location_type: string, location_id: int, min_capacity: int, max_capacity: int}>
     */
    public function bands(): array
    {
        return array_map(fn (array $band): array => [
            'location_type' => (string) $band['location_type'],
            'location_id' => (int) $band['location_id'],
            'min_capacity' => (int) $band['min_capacity'],
            'max_capacity' => (int) $band['max_capacity'],
        ], $this->validated()['bands']);
    }
}
