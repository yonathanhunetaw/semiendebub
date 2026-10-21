<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Procurement\Tariff;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** The government's rates for one HS code. */
class SaveTariffRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['hs_code' => Tariff::normalise((string) $this->input('hs_code'))]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $pct = ['required', 'numeric', 'min:0', 'max:1000'];
        $tariff = $this->route('tariff');

        return [
            'hs_code' => ['required', 'string', 'max:20', Rule::unique('tariffs', 'hs_code')->ignore($tariff instanceof Tariff ? $tariff->id : null)],
            'description' => ['nullable', 'string', 'max:255'],
            'duty_pct' => $pct,
            'excise_pct' => $pct,
            'vat_pct' => $pct,
            'surtax_pct' => $pct,
            'withholding_pct' => $pct,
            'other_pct' => $pct,
            'effective_from' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'hs_code.required' => 'An HS code is digits (dots and spaces are fine).',
            'hs_code.unique' => 'That HS code is already in the table: edit it instead.',
        ];
    }
}
