<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use App\Exceptions\MovementDomainException;
use App\Models\Store\Store;
use App\Services\Fulfillment\MovementDomainService;
use App\Services\Inventory\StockScope;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class StoreTransferRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'item_variant_id' => ['required', 'integer', 'exists:item_variants,id'],
            // Either two stores, or two named locations from the tree (any
            // shelf, floor or hub); the stores are then worked out from them.
            'from_store_id' => ['nullable', 'required_without:source_location_id', 'integer', 'exists:stores,id'],
            'to_store_id' => ['nullable', 'required_without:destination_location_id', 'integer', 'exists:stores,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'notes' => ['nullable', 'string', 'max:500'],
            // A delivery courier to carry it, when it leaves its site.
            'courier_id' => ['nullable', 'integer', 'exists:users,id'],
            // Optional sub-location endpoints: a transfer may name a shelf or a
            // back room rather than the store as a whole.
            'source_location_type' => ['nullable', 'string', 'max:255', 'required_with:source_location_id'],
            'source_location_id' => ['nullable', 'integer', 'min:1', 'required_with:source_location_type'],
            'destination_location_type' => ['nullable', 'string', 'max:255', 'required_with:destination_location_id'],
            'destination_location_id' => ['nullable', 'integer', 'min:1', 'required_with:destination_location_type'],
        ];
    }

    /**
     * A transfer is localized balancing: at least one end must be store-level.
     *
     * Freight between two warehouses belongs to the Shipment domain, and the
     * point of saying so here is that the stock keeper is told which screen to
     * use rather than being handed an exception.
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

                $domain = app(MovementDomainService::class);
                $scope = app(StockScope::class);

                $fromType = $this->string('source_location_type')->toString() ?: Store::class;
                $fromId = $this->integer('source_location_id') ?: $this->integer('from_store_id');
                $toType = $this->string('destination_location_type')->toString() ?: Store::class;
                $toId = $this->integer('destination_location_id') ?: $this->integer('to_store_id');

                foreach ([['source_location_id', $fromType, $fromId], ['destination_location_id', $toType, $toId]] as [$field, $type, $id]) {
                    if ($scope->leafFor($type, $id) === null) {
                        $validator->errors()->add($field, 'That location does not exist or cannot hold stock.');
                    }
                }

                if ($validator->errors()->isNotEmpty()) {
                    return;
                }

                if ($scope->leafFor($fromType, $fromId)?->is($scope->leafFor($toType, $toId))) {
                    $validator->errors()->add('destination_location_id', 'Origin and destination must be different places.');

                    return;
                }

                try {
                    $domain->assertTransferLeg($fromType, $fromId, $toType, $toId);
                } catch (MovementDomainException $exception) {
                    $validator->errors()->add(
                        'to_store_id',
                        $exception->getMessage() . ' Raise it as a shipment instead.',
                    );
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
            'to_store_id.different' => 'Origin and destination must be different stores.',
        ];
    }
}
