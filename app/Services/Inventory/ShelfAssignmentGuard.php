<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Exceptions\MovementDomainException;
use App\Models\Inventory\ShelfItemBand;
use App\Models\Inventory\StockLocation;
use App\Models\Item\ItemVariant;
use App\Services\Fulfillment\MovementDomainService;

/**
 * Planogram first: nothing is moved onto a Store Shelf unless the item has a
 * bin there.
 *
 * A bin is a ShelfItemBand row — the item assigned to that shelf with its max,
 * refill line and crit low. Called wherever a transfer is raised, so every
 * route into a shelf is refused the same way.
 */
class ShelfAssignmentGuard
{
    public function __construct(private readonly StockScope $scope)
    {
    }

    /**
     * @throws MovementDomainException when the destination is a shelf the item is not assigned to
     */
    public function assertMayStock(int $itemVariantId, string $destinationType, int $destinationId): void
    {
        $leaf = $this->scope->leafFor($destinationType, $destinationId);

        if ($leaf === null || $leaf->kind !== StockLocation::KIND_SHELF) {
            return;
        }

        $variant = ItemVariant::query()->with('item:id,product_name')->find($itemVariantId);

        if ($variant === null || $this->isAssigned($leaf, (int) $variant->item_id)) {
            return;
        }

        throw new MovementDomainException(
            sprintf(
                '%s has no bin on %s. A shelf manager has to assign it before stock can go there.',
                $variant->item?->product_name ?? 'This item',
                $leaf->name,
            ),
            MovementDomainService::DOMAIN_TRANSFER,
        );
    }

    public function isAssigned(StockLocation $shelf, int $itemId): bool
    {
        return ShelfItemBand::query()
            ->where('stock_location_id', $shelf->id)
            ->where('item_id', $itemId)
            ->exists();
    }
}
