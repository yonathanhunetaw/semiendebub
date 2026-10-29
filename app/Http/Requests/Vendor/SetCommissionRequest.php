<?php

declare(strict_types=1);

namespace App\Http\Requests\Vendor;

use Illuminate\Foundation\Http\FormRequest;

/** The marketplace commission, a percentage of each paid vendor order. */
class SetCommissionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['commission_pct' => ['required', 'numeric', 'min:0', 'max:50']];
    }
}
