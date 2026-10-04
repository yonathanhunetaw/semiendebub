<?php

declare(strict_types=1);

namespace App\Http\Requests\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\Transfer;
use App\Services\Inventory\StockPermissions;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Carry a floor → shelf transfer across: one step, since staff walk it over
 * themselves. Only the store's stock keepers and the shelf's or floor's
 * managers (StockPermissions::canShelve).
 */
class ShelveTransferRequest extends FormRequest
{
    public function authorize(): bool
    {
        $shelf = $this->shelf();

        return $shelf !== null && app(StockPermissions::class)->canShelve($this->user(), $shelf);
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [];
    }

    /** The shelf the transfer lands on, or null when it is not a floor → shelf move. */
    public function shelf(): ?StockLocation
    {
        $transfer = $this->route('transfer');

        if (! $transfer instanceof Transfer
            || $transfer->destination_location_type !== StockLocation::class
            || $transfer->source_location_type !== StockLocation::class) {
            return null;
        }

        $shelf = StockLocation::query()->find($transfer->destination_location_id);
        $floor = StockLocation::query()->find($transfer->source_location_id);

        return $shelf !== null
            && $floor !== null
            && $shelf->kind === StockLocation::KIND_SHELF
            && $floor->kind === StockLocation::KIND_BACKROOM
            && $shelf->sameSiteAs($floor)
                ? $shelf
                : null;
    }
}
