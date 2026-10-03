<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Re-point a run at different stores.
 *
 * Both ends are optional so the Build screen can change one without having to
 * restate the other, but whichever arrive must be real stores.
 */
class UpdateShipmentRouteRequest extends FormRequest
{
    use Concerns\ResolvesShipmentEnds;

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
            'origin_location_id' => ['nullable', 'integer', 'exists:stock_locations,id'],
            'destination_location_id' => ['nullable', 'integer', 'exists:stock_locations,id'],
            'origin_store_id' => ['nullable', 'integer', 'exists:stores,id'],
            'destination_store_id' => ['nullable', 'integer', 'exists:stores,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'destination_store_id.different' => 'A shipment must move between two different stores.',
        ];
    }
}
