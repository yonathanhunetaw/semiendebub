<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentCost;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Money paid on a consignment's way in. A second person confirms it (ConsignmentService). */
class RecordConsignmentCostRequest extends FormRequest
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
            'stage' => ['required', Rule::in([Consignment::FORMING, ...Consignment::IN_TRANSIT])],
            'kind' => ['required', Rule::in(array_keys(ConsignmentCost::KINDS))],
            'description' => ['nullable', 'string', 'max:255', 'required_if:kind,misc'],
            'currency' => ['required', Rule::in(config('procurement.currencies', []))],
            'exchange_rate' => ['nullable', 'numeric', 'gt:0', 'max:1000000'],
            'amount' => ['required', 'numeric', 'gt:0', 'max:10000000000'],
            'allocation' => ['nullable', Rule::in(ConsignmentCost::ALLOCATIONS)],
            'recoverable' => ['nullable', 'boolean'],
            'reference' => ['nullable', 'string', 'max:80'],
            'paid_on' => ['nullable', 'date_format:Y-m-d'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'description.required_if' => 'Say what it was for.',
        ];
    }
}
