<?php

declare(strict_types=1);

namespace App\Http\Requests\Vendor;

use Illuminate\Foundation\Http\FormRequest;

class RejectVendorApplicationRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return ['reason' => ['required', 'string', 'min:3', 'max:1000']];
    }
}
