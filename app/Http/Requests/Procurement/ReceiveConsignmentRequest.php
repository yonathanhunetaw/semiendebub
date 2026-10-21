<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** The count at the Main Hub, per consignment line. Who may receive is ConsignmentReceiving's call. */
class ReceiveConsignmentRequest extends FormRequest
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
            'hub_id' => ['required', 'integer', 'exists:stock_locations,id'],
            'counts' => ['nullable', 'array'],
            'counts.*.received' => ['required', 'integer', 'min:0', 'max:10000000'],
            'counts.*.damaged' => ['nullable', 'integer', 'min:0', 'max:10000000', 'lte:counts.*.received'],
            'counts.*.note' => ['nullable', 'string', 'max:255'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'counts.*.damaged.lte' => 'More cannot be damaged than arrived.',
        ];
    }
}
