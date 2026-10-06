<?php

declare(strict_types=1);

namespace App\Http\Requests\Fleet;

use App\Models\Fulfillment\Vehicle;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A car being added to the fleet or edited. */
class SaveVehicleRequest extends FormRequest
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
        $vehicle = $this->route('vehicle');

        return [
            'name' => ['required', 'string', 'max:255'],
            'plate' => ['required', 'string', 'max:64', Rule::unique('vehicles', 'plate')->ignore($vehicle instanceof Vehicle ? $vehicle->id : null)],
            'max_cbm' => ['required', 'numeric', 'min:0', 'max:9999'],
            'payload_kg' => ['nullable', 'integer', 'min:0', 'max:100000'],
            'status' => ['required', Rule::in([Vehicle::STATUS_ACTIVE, Vehicle::STATUS_INACTIVE])],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, mixed> */
    public function vehicleData(): array
    {
        $data = $this->validated();
        $data['payload_kg'] = (int) ($data['payload_kg'] ?? 0);

        return $data;
    }
}
