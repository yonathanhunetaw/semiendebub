<?php

declare(strict_types=1);

namespace App\Http\Requests\Seller;

use Illuminate\Foundation\Http\FormRequest;

class ReorderCartsRequest extends FormRequest
{
    /**
     * Per-cart ownership is enforced in the controller through CartPolicy,
     * which is the only place the target store is known.
     */
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    /**
     * Previously only `order => array` was validated, so any scalar could be
     * fed straight into a mass update. Each element is now pinned to a real
     * cart id.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'order' => ['required', 'array', 'min:1', 'max:200'],
            'order.*' => ['required', 'integer', 'distinct', 'exists:carts,id'],
        ];
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'order.*.distinct' => 'A cart cannot appear twice in the ordering.',
            'order.*.exists' => 'One of the carts no longer exists.',
        ];
    }

    /**
     * Cart ids in their new priority order.
     *
     * @return array<int, int>
     */
    public function cartIds(): array
    {
        return array_map('intval', $this->validated('order'));
    }
}
