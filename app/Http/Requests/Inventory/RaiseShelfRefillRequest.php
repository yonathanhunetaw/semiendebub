<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\ItemRefillRoute;
use App\Models\Inventory\StockLocation;
use App\Services\Inventory\StockPermissions;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Raise a refill for one bin by hand. `start_at` skips the item's route up to
 * that source — e.g. straight to the Remote Hub when the floor's count is wrong.
 */
class RaiseShelfRefillRequest extends FormRequest
{
    public function authorize(): bool
    {
        $shelf = $this->route('location');

        return $shelf instanceof StockLocation
            && app(StockPermissions::class)->canRaiseRefill($this->user(), $shelf);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'start_at' => ['nullable', 'string', Rule::in(ItemRefillRoute::SOURCES)],
        ];
    }
}
