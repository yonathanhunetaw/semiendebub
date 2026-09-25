<?php

declare(strict_types=1);

namespace App\Http\Requests\Delivery;

use App\Services\DeliveryService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TransitionDeliveryRequest extends FormRequest
{
    /**
     * Ownership of the run is checked in the controller, which has the model.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => [
                'required',
                'string',
                Rule::in([
                    DeliveryService::STATUS_DISPATCHED,
                    DeliveryService::STATUS_IN_TRANSIT,
                    DeliveryService::STATUS_DELIVERED,
                    DeliveryService::STATUS_FAILED,
                    DeliveryService::STATUS_RETURNED,
                ]),
            ],
            // A failure must say why; anything else must not carry a reason.
            'failure_reason' => [
                Rule::requiredIf(fn () => $this->input('status') === DeliveryService::STATUS_FAILED),
                'nullable',
                'string',
                'max:255',
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'failure_reason.required' => 'Say why the delivery failed.',
        ];
    }
}
