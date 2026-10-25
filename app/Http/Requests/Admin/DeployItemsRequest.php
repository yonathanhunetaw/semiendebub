<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** Settings → Import / Export → Put items in a store: which store, and every item missing there or the ids in a file. */
class DeployItemsRequest extends FormRequest
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
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'scope' => ['required', 'in:missing,file'],
            'csv' => ['required_if:scope,file', 'nullable', 'string', 'max:2000000'],
            'dry_run' => ['sometimes', 'boolean'],
        ];
    }
}
