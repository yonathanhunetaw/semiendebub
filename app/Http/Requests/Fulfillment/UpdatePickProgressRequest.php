<?php

declare(strict_types=1);

namespace App\Http\Requests\Fulfillment;

use Illuminate\Foundation\Http\FormRequest;

/** Pick & pack progress: a line in hand (or put back), or the parcel packed (or opened). */
class UpdatePickProgressRequest extends FormRequest
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
            'done' => ['required', 'boolean'],
        ];
    }
}
