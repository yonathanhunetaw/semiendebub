<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\StockLocation;
use App\Services\Inventory\StockPermissions;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Set where a store refills an item from, in order. The shelf in the URL names
 * the store; only that store's managers (and admins) may change it.
 */
class UpdateRefillRouteRequest extends FormRequest
{
    public function authorize(): bool
    {
        $shelf = $this->route('location');

        return $shelf instanceof StockLocation
            && $shelf->kind === StockLocation::KIND_SHELF
            && $shelf->store_id !== null
            && app(StockPermissions::class)->canSetRefillRoute($this->user(), (int) $shelf->store_id);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'sources' => ['required', 'array', 'min:1', 'max:'.count(ItemRefillRoute::SOURCES)],
            'sources.*' => ['required', 'string', 'distinct', Rule::in(ItemRefillRoute::SOURCES)],
        ];
    }
}
