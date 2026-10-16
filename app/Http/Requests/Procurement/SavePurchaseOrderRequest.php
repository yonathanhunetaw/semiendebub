<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Procurement\PayableInstallment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A purchase order draft with its lines, new or changed. */
class SavePurchaseOrderRequest extends FormRequest
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
        $home = (string) config('procurement.home_currency', 'ETB');

        return [
            'supplier_id' => ['required', 'integer', Rule::exists('suppliers', 'id')->whereNull('deleted_at')],
            'currency' => ['required', Rule::in(config('procurement.currencies', []))],
            // ETB is always 1; any other currency needs today's rate.
            'exchange_rate' => ['nullable', 'numeric', 'gt:0', 'max:1000000', "required_unless:currency,{$home}"],
            'payment_terms' => ['required', Rule::in(array_keys(config('procurement.payment_terms', [])))],
            'payment_days' => ['nullable', 'integer', 'min:0', 'max:730', 'required_if:payment_terms,fixed_date'],
            'payment_anchor' => ['nullable', Rule::in(['order', 'shipping'])],
            // Installments: each row a percent or an amount, and when it falls due.
            'payment_schedule' => ['nullable', 'array', 'max:12', 'required_if:payment_terms,installments'],
            'payment_schedule.*.label' => ['nullable', 'string', 'max:80'],
            'payment_schedule.*.percent' => ['nullable', 'numeric', 'gt:0', 'max:100', 'required_without:payment_schedule.*.amount'],
            'payment_schedule.*.amount' => ['nullable', 'numeric', 'gt:0', 'max:1000000000'],
            'payment_schedule.*.due' => ['required', Rule::in(PayableInstallment::DUE_RULES)],
            'payment_schedule.*.days' => ['nullable', 'integer', 'min:0', 'max:730', 'required_if:payment_schedule.*.due,after_order,after_shipping,after_arrival'],
            'payment_schedule.*.date' => ['nullable', 'date', 'required_if:payment_schedule.*.due,on_date'],
            'incoterm' => ['nullable', Rule::in(['EXW', 'FOB', 'CFR', 'CIF', 'DAP', 'DDP'])],
            'expected_at' => ['nullable', 'date'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'lines' => ['required', 'array', 'min:1', 'max:300'],
            'lines.*.item_variant_id' => ['required', 'integer', 'distinct', 'exists:item_variants,id'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
            'lines.*.unit_price' => ['required', 'numeric', 'min:0', 'max:100000000'],
            'lines.*.cbm' => ['nullable', 'numeric', 'min:0', 'max:100000'],
            'lines.*.weight_kg' => ['nullable', 'numeric', 'min:0', 'max:10000000'],
            'lines.*.supplier_sku' => ['nullable', 'string', 'max:120'],
            'lines.*.notes' => ['nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'exchange_rate.required_unless' => 'Enter the exchange rate to ETB.',
            'payment_days.required_if' => 'Say how many days after the order the payment is due.',
            'lines.required' => 'Add at least one line.',
            'payment_schedule.required_if' => 'Add the installments.',
            'payment_schedule.*.percent.required_without' => 'Give each installment a percent or an amount.',
            'payment_schedule.*.days.required_if' => 'Say how many days.',
            'payment_schedule.*.date.required_if' => 'Pick the date.',
            'lines.*.item_variant_id.distinct' => 'This SKU is already on the order; change its quantity instead.',
        ];
    }
}
