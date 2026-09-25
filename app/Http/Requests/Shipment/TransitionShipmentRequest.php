<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use App\Services\ShipmentWorkflowService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class TransitionShipmentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Whether the *role* may drive this transition, and whether the shipment
     * may currently make it, are both decided in the controller — this only
     * pins the value to a known status.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'status' => [
                'required',
                'string',
                Rule::in([
                    ShipmentWorkflowService::SCHEDULED,
                    ShipmentWorkflowService::PICKING,
                    ShipmentWorkflowService::READY,
                    ShipmentWorkflowService::DISPATCHED,
                    ShipmentWorkflowService::IN_TRANSIT,
                    ShipmentWorkflowService::DELIVERED,
                    ShipmentWorkflowService::RECEIVED,
                    ShipmentWorkflowService::CANCELLED,
                ]),
            ],
            // A cancellation must say why; other moves must not carry a reason.
            'cancel_reason' => [
                Rule::requiredIf(fn () => $this->input('status') === ShipmentWorkflowService::CANCELLED),
                'nullable', 'string', 'max:255',
            ],
            'gate_pass' => ['nullable', 'string', 'max:64'],
            'eta' => ['nullable', 'date'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'cancel_reason.required' => 'Say why the shipment is being cancelled.',
        ];
    }

    /**
     * Extra columns to write alongside the status change.
     *
     * @return array<string, mixed>
     */
    public function extraAttributes(): array
    {
        return array_filter([
            'cancel_reason' => $this->validated('cancel_reason'),
            'gate_pass' => $this->validated('gate_pass'),
            'eta' => $this->validated('eta'),
        ], fn ($value) => $value !== null);
    }
}
