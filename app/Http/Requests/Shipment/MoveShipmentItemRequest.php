<?php

declare(strict_types=1);

namespace App\Http\Requests\Shipment;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Move one manifest line onto another run.
 *
 * The target is a shipment id rather than "previous/next", because adjacency is
 * not a property the domain has: the Build screen picks from the open runs the
 * server offered it.
 */
class MoveShipmentItemRequest extends FormRequest
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
            'target_shipment_id' => ['required', 'integer', 'exists:shipments,id'],
        ];
    }
}
