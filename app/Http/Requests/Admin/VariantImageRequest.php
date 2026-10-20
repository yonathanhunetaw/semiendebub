<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use Illuminate\Foundation\Http\FormRequest;

/** One picture for one of a variant's five slots. */
final class VariantImageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // global-zone route; admin middleware
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return ['image' => ['required', 'image', 'mimes:jpeg,png,jpg,gif,webp', 'max:5120']];
    }
}
