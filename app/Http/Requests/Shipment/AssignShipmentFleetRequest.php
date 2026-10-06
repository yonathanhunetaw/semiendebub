<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The car a run goes in and the drivers it is offered to. No drivers means
 * the run is open to every driver.
 */
class AssignShipmentFleetRequest extends FormRequest
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
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'courier_ids' => ['nullable', 'array', 'max:50'],
            'courier_ids.*' => ['integer', 'exists:users,id'],
        ];
    }

    public function vehicleId(): ?int
    {
        $id = $this->validated('vehicle_id');

        return $id !== null ? (int) $id : null;
    }

    /** @return array<int, int> */
    public function courierIds(): array
    {
        return array_map('intval', (array) ($this->validated('courier_ids') ?? []));
    }
}
