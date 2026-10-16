<?php

declare(strict_types=1);

namespace App\Http\Requests\Document;

use Illuminate\Foundation\Http\FormRequest;

/** A receipt or bill to put on the calendar: a photo or a PDF. */
class UploadDocumentRequest extends FormRequest
{
    public const MAX_KB = 10240;

    public function authorize(): bool
    {
        // The route group's role gate decides who may use the calendar.
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,webp,gif,pdf', 'max:'.self::MAX_KB],
        ];
    }

    public function messages(): array
    {
        return [
            'file.mimes' => 'Upload a photo (JPG, PNG, WEBP) or a PDF.',
            'file.max' => 'The file is too big: 10 MB at most.',
        ];
    }
}
