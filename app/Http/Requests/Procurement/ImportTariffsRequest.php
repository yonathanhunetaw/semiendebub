<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** Tariff rows pasted as CSV: hs_code, description, duty, excise, vat, surtax, withholding, other. */
class ImportTariffsRequest extends FormRequest
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
            'csv' => ['required', 'string', 'max:2000000'],
        ];
    }
}
