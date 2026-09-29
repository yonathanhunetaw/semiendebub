<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use Illuminate\Foundation\Http\FormRequest;

/**
 * The manifest as the Build screen currently has it: line quantities, the
 * vehicle, and the slot the creator is proposing.
 */
class SaveShipmentManifestRequest extends FormRequest
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
            'quantities' => ['nullable', 'array'],
            'quantities.*' => ['nullable', 'integer', 'min:0', 'max:1000000'],
            'vehicle_name' => ['nullable', 'string', 'max:255'],
            'vehicle_plate' => ['nullable', 'string', 'max:64'],
            'vehicle_max_cbm' => ['nullable', 'numeric', 'min:0', 'max:9999'],
            'scheduled_run' => ['nullable', 'date'],
        ];
    }
}
