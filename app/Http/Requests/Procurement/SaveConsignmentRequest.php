<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use Illuminate\Foundation\Http\FormRequest;

/** A consignment's paperwork: route, container, bill of lading, ETA. */
class SaveConsignmentRequest extends FormRequest
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
            'freight_route_id' => ['nullable', 'integer', 'exists:freight_routes,id'],
            'container_number' => ['nullable', 'string', 'max:60'],
            'bill_of_lading' => ['nullable', 'string', 'max:80'],
            'eta' => ['nullable', 'date_format:Y-m-d'],
            'notes' => ['nullable', 'string', 'max:2000'],
        ];
    }
}
