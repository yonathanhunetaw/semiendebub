<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use App\Services\ShipmentWorkflowService;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class AgreeShipmentRequest extends FormRequest
{
    /**
     * Which party the user is entitled to tick is resolved in the controller,
     * which has the shipment.
     */
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
            // Optional: when omitted the controller infers it from the user's
            // role and store. Supplied explicitly it is still authorized.
            'party' => ['nullable', 'string', Rule::in(ShipmentWorkflowService::PARTIES)],
            'slot' => ['required', 'string', 'max:32'],
            'stance' => [
                'nullable',
                'string',
                Rule::in([
                    ShipmentWorkflowService::AGREEMENT_ACCEPTED,
                    ShipmentWorkflowService::AGREEMENT_RESCHEDULED,
                ]),
            ],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'slot.required' => 'Pick the time slot you are agreeing to.',
        ];
    }

    public function slot(): string
    {
        return (string) $this->validated('slot');
    }

    public function stance(): string
    {
        return (string) ($this->validated('stance') ?? ShipmentWorkflowService::AGREEMENT_ACCEPTED);
    }
}
