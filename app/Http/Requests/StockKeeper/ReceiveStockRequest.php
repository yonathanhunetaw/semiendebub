<?php

declare(strict_types=1);

namespace App\Http\Requests\StockKeeper;

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
                Rule::in([StockKeeperService::WAREHOUSE_TYPE, StockKeeperService::STORE_TYPE]),
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
            'location_type.in' => 'Stock can only be received into a warehouse or a store.',
            'quantity.min' => 'Receive at least one unit.',
        ];
    }

    /**
     * The location must actually exist in whichever table its type names.
     */
    public function withValidator($validator): void
    {
        $validator->after(function ($validator): void {
            $table = $this->input('location_type') === StockKeeperService::WAREHOUSE_TYPE
                ? 'warehouses'
                : 'stores';

            $exists = \Illuminate\Support\Facades\DB::table($table)
                ->where('id', $this->input('location_id'))
                ->exists();

            if (! $exists) {
                $validator->errors()->add('location_id', 'That location does not exist.');
            }
        });
    }
}
