<?php

declare(strict_types=1);

namespace App\Http\Requests\Fulfillment;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Pick & Pack: the exact location each line of a paid order came off.
 *
 * Every line must appear. A partially sourced order is not a state the pipeline
 * has — the order either moves to "To Deliver" with a full set of decisions, or
 * it stays in Pick & Pack.
 */
class ConfirmSourcingRequest extends FormRequest
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
            'lines' => ['required', 'array', 'min:1', 'max:200'],
            'lines.*.sale_item_id' => ['required', 'integer', 'exists:sale_items,id'],
            'lines.*.location_type' => ['required', 'string', 'max:255'],
            'lines.*.location_id' => ['required', 'integer', 'min:1'],
            'lines.*.quantity' => ['nullable', 'integer', 'min:1', 'max:1000000'],
        ];
    }

    /**
     * @return array<int, array{sale_item_id: int, location_type: string, location_id: int, quantity?: int}>
     */
    public function decisions(): array
    {
        return array_map(function (array $line): array {
            $decision = [
                'sale_item_id' => (int) $line['sale_item_id'],
                'location_type' => (string) $line['location_type'],
                'location_id' => (int) $line['location_id'],
            ];

            if (isset($line['quantity'])) {
                $decision['quantity'] = (int) $line['quantity'];
            }

            return $decision;
        }, $this->validated()['lines']);
    }
}
