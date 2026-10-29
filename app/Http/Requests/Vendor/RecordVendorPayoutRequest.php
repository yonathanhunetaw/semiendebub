<?php

declare(strict_types=1);

namespace App\Http\Requests\Vendor;

use Illuminate\Foundation\Http\FormRequest;

/** A payout to a vendor, as recorded by the first of the two people. */
class RecordVendorPayoutRequest extends FormRequest
{
    public const METHODS = ['bank_transfer', 'telebirr', 'cash'];

    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'amount' => ['required', 'numeric', 'min:0.01', 'max:100000000'],
            'method' => ['required', 'string', 'in:'.implode(',', self::METHODS)],
            'reference' => ['nullable', 'string', 'max:120'],
        ];
    }
}
