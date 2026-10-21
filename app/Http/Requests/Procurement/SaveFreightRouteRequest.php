<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** What a route costs per CBM, for estimates before a real shipment exists. */
class SaveFreightRouteRequest extends FormRequest
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
        $money = ['required', 'numeric', 'min:0', 'max:100000000'];

        return [
            'name' => ['required', 'string', 'max:255'],
            'origin' => ['nullable', 'string', 'max:120'],
            'currency' => ['required', Rule::in(config('procurement.currencies', []))],
            'overseas_storage_per_cbm' => $money,
            'sea_freight_per_cbm' => $money,
            'insurance_pct' => ['required', 'numeric', 'min:0', 'max:100'],
            'port_clearing_per_cbm' => $money,
            'land_transport_per_cbm' => $money,
            'to_store_per_cbm' => $money,
            'transit_days' => ['nullable', 'integer', 'min:0', 'max:365'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'is_active' => ['required', 'boolean'],
        ];
    }
}
