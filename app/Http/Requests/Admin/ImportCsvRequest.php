<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** A CSV pasted or loaded in the browser (Settings → Import / Export), checked first with dry_run, then applied. */
class ImportCsvRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * The ticked options a dataset offers (allow_removals …) are read in the controller by name.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'csv' => ['required', 'string', 'max:2000000'],
            'dry_run' => ['sometimes', 'boolean'],
            'allow_removals' => ['sometimes', 'boolean'],
        ];
    }
}
