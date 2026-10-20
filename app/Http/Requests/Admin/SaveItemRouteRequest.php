<?php

declare(strict_types=1);

namespace App\Http\Requests\Admin;

use App\Models\Inventory\ItemRefillRoute;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Where a store refills an item from, in order. */
final class SaveItemRouteRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // the controller asks StockPermissions::canSetRefillRoute for the store
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'sources' => ['required', 'array', 'min:1', 'max:'.count(ItemRefillRoute::SOURCES)],
            'sources.*' => ['required', 'string', 'distinct', Rule::in(ItemRefillRoute::SOURCES)],
        ];
    }
}
