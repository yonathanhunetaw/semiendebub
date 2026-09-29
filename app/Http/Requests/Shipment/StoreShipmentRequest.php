<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use Illuminate\Foundation\Http\FormRequest;

class StoreShipmentRequest extends FormRequest
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
            'origin_store_id' => ['required', 'integer', 'exists:stores,id'],
            'destination_store_id' => [
                'required', 'integer', 'exists:stores,id', 'different:origin_store_id',
            ],
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
            'distance_km' => ['nullable', 'numeric', 'min:0', 'max:99999'],
            'slot' => ['nullable', 'string', 'max:64'],
            'notes' => ['nullable', 'string', 'max:2000'],
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
