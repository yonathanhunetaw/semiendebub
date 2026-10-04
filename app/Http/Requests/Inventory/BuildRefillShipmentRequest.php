<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\StockLocation;
use Illuminate\Validation\Rule;

/**
 * Build a shipment from Hub A or B to a store's floor or its Remote Hub out of
 * that store's refill suggestions. Choosing the hub happens here, not before.
 * The same per-line checks as adding to an existing manifest.
 */
class BuildRefillShipmentRequest extends AddRefillsToManifestRequest
{
    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return parent::rules() + [
            'hub_location_id' => ['required', 'integer', Rule::exists('stock_locations', 'id')->where('kind', StockLocation::KIND_MAIN_HUB)],
            'destination_location_id' => [
                'required',
                'integer',
                Rule::exists('stock_locations', 'id')->whereIn('kind', [StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB]),
            ],
        ];
    }
}
