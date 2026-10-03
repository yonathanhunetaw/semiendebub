<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemInventoryLocation;
use App\Services\Inventory\StockScope;
use App\Services\StockKeeperService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class ReceiveStockRequest extends FormRequest
{
    /**
     * Route middleware already pins this to an authenticated stock keeper.
     */
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
            'location_type' => [
                'required',
                'string',
                // A shop floor and a back room hold stock in the same ledger, so
                // goods can be booked straight onto the floor rather than into
                // the store as an abstraction and then "found" there later.
                Rule::in([
                    StockLocation::class,
                    StockKeeperService::WAREHOUSE_TYPE,
                    StockKeeperService::STORE_TYPE,
                    ItemInventoryLocation::class,
                ]),
            ],
            'location_id' => ['required', 'integer', 'min:1'],
            'quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'min_stock_level' => ['nullable', 'integer', 'min:0', 'max:1000000'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'location_type.in' => 'Stock can only be received into a shelf, a store floor or a hub.',
            'quantity.min' => 'Receive at least one unit.',
        ];
    }

    /**
     * The location must resolve to a place that can hold stock — a shelf, a
     * store floor, a remote hub or a main hub (a store as a whole means its
     * floor). See App\Services\Inventory\StockScope::leafFor().
     */
    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            if ($validator->errors()->isNotEmpty()) {
                return;
            }

            $leaf = app(StockScope::class)->leafFor(
                (string) $this->input('location_type'),
                (int) $this->input('location_id'),
            );

            if ($leaf === null) {
                $validator->errors()->add('location_id', 'That location does not exist or cannot hold stock.');
            }
        });
    }
}
