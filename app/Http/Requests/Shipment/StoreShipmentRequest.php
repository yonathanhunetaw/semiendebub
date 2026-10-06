<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use App\Exceptions\MovementDomainException;
use App\Models\Store\Store;
use App\Services\Fulfillment\MovementDomainService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreShipmentRequest extends FormRequest
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
            // Either a location from the tree (Main Hub A/B → a store or a
            // Remote Hub) or, as before, two facilities.
            'origin_location_id' => ['nullable', 'required_without:origin_store_id', 'integer', 'exists:stock_locations,id'],
            'destination_location_id' => ['nullable', 'required_without:destination_store_id', 'integer', 'exists:stock_locations,id'],
            'origin_store_id' => ['nullable', 'required_without:origin_location_id', 'integer', 'exists:stores,id'],
            'destination_store_id' => ['nullable', 'required_without:destination_location_id', 'integer', 'exists:stores,id'],
            'scheduled_for' => ['nullable', 'date'],
            /*
             * The alternative windows the creator puts on the table.
             *
             * The "New Shipment" sheet has always collected these under
             * "Alternate Time Windows", and they were dropped three times over:
             * the page never sent them, this rule set never accepted them, and
             * the controller never forwarded them. So a run reached the
             * agreement gate offering exactly one time — and since
             * recordPartyAgreement() refuses any slot that was not proposed,
             * the driver and both docks could only take that one time or leave
             * it. There was nothing to agree *about*.
             */
            'schedule_options' => ['nullable', 'array', 'max:12'],
            'schedule_options.*' => ['nullable', 'date'],
            'vehicle_name' => ['nullable', 'string', 'max:255'],
            'vehicle_plate' => ['nullable', 'string', 'max:64'],
            'vehicle_max_cbm' => ['nullable', 'numeric', 'min:0', 'max:9999'],
            'vehicle_id' => ['nullable', 'integer', 'exists:vehicles,id'],
            'courier_ids' => ['nullable', 'array', 'max:50'],
            'courier_ids.*' => ['integer', 'exists:users,id'],
            'distance_km' => ['nullable', 'numeric', 'min:0', 'max:99999'],
            'slot' => ['nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /**
     * A shipment runs from a Main Hub to a store or a Remote Hub.
     *
     * Checked here as well as in the service so the picker gets a field error
     * rather than a 500.
     *
     * @return array<int, callable>
     */
    public function after(): array
    {
        return [
            function (Validator $validator): void {
                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                $origin = $this->originLocation();
                $destination = $this->destinationLocation();
                $field = $this->filled('destination_location_id') ? 'destination_location_id' : 'destination_store_id';

                if ($origin === null || $destination === null) {
                    $validator->errors()->add($field, 'Both ends of a shipment must be places that can hold stock.');

                    return;
                }

                $domain = app(MovementDomainService::class);

                try {
                    $domain->assertShipmentEnds(
                        $domain->describe(\App\Models\Inventory\StockLocation::class, (int) $origin->id),
                        $domain->describe(\App\Models\Inventory\StockLocation::class, (int) $destination->id),
                    );
                } catch (MovementDomainException $exception) {
                    $validator->errors()->add($field, $exception->getMessage());
                }
            },
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
