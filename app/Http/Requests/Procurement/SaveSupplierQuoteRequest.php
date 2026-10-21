<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Procurement\FreightRoute;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** What a supplier asks for a product idea. Who may take it, and when, is SupplierQuoteService's call. */
class SaveSupplierQuoteRequest extends FormRequest
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
        $rules = [
            'supplier_id' => ['required', 'integer', 'exists:suppliers,id'],
            'currency' => ['required', Rule::in(config('procurement.currencies', []))],
            'exchange_rate' => ['nullable', 'numeric', 'gt:0', 'max:1000000'],
            'unit_price' => ['required', 'numeric', 'gt:0', 'max:1000000000'],
            'moq' => ['nullable', 'integer', 'min:1', 'max:10000000'],
            'pieces_per_carton' => ['required', 'integer', 'min:1', 'max:1000000'],
            'cbm_per_carton' => ['nullable', 'numeric', 'gt:0', 'max:1000'],
            'kg_per_carton' => ['nullable', 'numeric', 'gt:0', 'max:100000'],
            'lead_days' => ['nullable', 'integer', 'min:0', 'max:730'],
            'valid_until' => ['nullable', 'date_format:Y-m-d'],
            'hs_code' => ['nullable', 'string', 'max:20', 'regex:/^[0-9 .]+$/'],
            'freight_route_id' => ['nullable', 'integer', 'exists:freight_routes,id'],
            'quantity' => ['nullable', 'integer', 'min:1', 'max:10000000'],
            'overrides' => ['nullable', 'array'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];

        foreach (FreightRoute::FIGURES as $key) {
            $rules["overrides.{$key}"] = ['nullable', 'numeric', 'min:0', 'max:100000000'];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'hs_code.regex' => 'An HS code is digits (dots and spaces are fine).',
        ];
    }
}
