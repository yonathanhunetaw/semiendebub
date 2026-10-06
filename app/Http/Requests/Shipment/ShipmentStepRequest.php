<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use App\Services\Fulfillment\ShipmentHandoffService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** One hand-off step: a pick, a prepare, a check or a signature. */
class ShipmentStepRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    protected function prepareForValidation(): void
    {
        $this->merge(['step' => $this->route('step')]);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'step' => ['required', Rule::in(ShipmentHandoffService::STEPS)],
            'variant_id' => ['required_if:step,'.ShipmentHandoffService::PICK_LINE, 'nullable', 'integer'],
            'picked' => ['nullable', 'boolean'],
            'bay' => ['nullable', 'string', 'max:64'],
            'signature' => [
                Rule::requiredIf(in_array($this->input('step'), [ShipmentHandoffService::COURIER_SIGN, ShipmentHandoffService::RECEIVER_SIGN], true)),
                'nullable', 'string', 'max:400000',
            ],
        ];
    }

    /** @return array<string, mixed> */
    public function payload(): array
    {
        return collect($this->validated())->except('step')->filter(fn ($v) => $v !== null)->all();
    }
}
