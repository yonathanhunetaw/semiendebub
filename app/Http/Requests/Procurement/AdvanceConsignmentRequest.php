<?php

declare(strict_types=1);

namespace App\Http\Requests\Procurement;

use App\Models\Procurement\Consignment;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Where the goods have got to. Whether they may go there is ConsignmentService's call. */
class AdvanceConsignmentRequest extends FormRequest
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
            'to' => ['required', Rule::in(Consignment::IN_TRANSIT)],
        ];
    }
}
