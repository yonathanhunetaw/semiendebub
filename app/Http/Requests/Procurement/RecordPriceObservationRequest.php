<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Procurement\PriceObservation;
use App\Services\Workforce\LocalTime;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** A price seen at a shop. Whether this person may record it there is PriceCheckService's call. */
class RecordPriceObservationRequest extends FormRequest
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
            'shop_id' => ['required', 'integer', 'exists:shops,id'],
            'observed_on' => ['nullable', 'date_format:Y-m-d', 'before_or_equal:'.LocalTime::dateOf()],
            'pack_type' => ['required', Rule::in(PriceObservation::PACK_TYPES)],
            'pieces_per_pack' => ['nullable', 'integer', 'min:1', 'max:100000', 'required_unless:pack_type,piece'],
            'min_qty' => ['nullable', 'integer', 'min:1', 'max:1000000'],
            'price' => ['required', 'numeric', 'gt:0', 'max:1000000000'],
            'note' => ['nullable', 'string', 'max:500'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'pieces_per_pack.required_unless' => 'Say how many pieces are in one packet or carton.',
            'observed_on.before_or_equal' => 'The day you saw the price cannot be in the future.',
        ];
    }
}
