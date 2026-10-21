<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** ETB for one unit of a currency, from today. */
class SetExchangeRateRequest extends FormRequest
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
        $foreign = array_values(array_diff(config('procurement.currencies', []), [config('procurement.home_currency', 'ETB')]));

        return [
            'currency' => ['required', Rule::in($foreign)],
            'rate' => ['required', 'numeric', 'gt:0', 'max:1000000'],
        ];
    }
}
