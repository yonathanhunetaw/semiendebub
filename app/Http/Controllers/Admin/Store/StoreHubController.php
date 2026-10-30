<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\Stocktake;
use App\Models\StockKeeper\Transfer;
use App\Models\Store\StoreVariant;
use App\Models\Store\Store;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\ReplenishmentProposalService;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Store page: a banner with the store's figures, then grouped cards (Stock,
 * Movement, Approvals, Setup), laid out like the seller's More page. Each tile
 * opens one screen; the screens carry a back link to here.
 */
final class StoreHubController extends Controller
{
    public function __construct(
        private readonly ActiveStore $activeStore,
        private readonly ReplenishmentProposalService $planner,
    ) {
    }

    public function __invoke(Store $store): Response
    {
        $scope = $this->activeStore->scopeIds();

        $storeId = (int) $store->id;

        return Inertia::render('Admin/Stores/Hub', [
            'store' => ['id' => $storeId, 'name' => $store->name],
            // The figures across the top of the page: what the store carries and what is moving.
            'stats' => [
                'items' => StoreVariant::query()->where('store_id', $storeId)->distinct()->count('item_id'),
                'shipments' => Shipment::query()->forStore($storeId)->open()->count(),
                'transfers' => Transfer::query()->active()
                    ->whereNotIn('status', ['completed'])
                    ->where(fn ($query) => $query->where('from_store_id', $storeId)->orWhere('to_store_id', $storeId))
                    ->count(),
            ],
            'counts' => [
                // Refills the planner proposes, waiting for a manager's ruling.
                'refills' => count($this->planner->pendingProposals($storeId)),
                // Stocktakes a keeper submitted, waiting for someone else to approve.
                'counts' => Stocktake::query()
                    ->where('status', Stocktake::SUBMITTED)
                    ->when($scope !== null, fn ($query) => $this->activeStore->applyThrough($query, 'location'))
                    ->count(),
            ],
        ]);
    }
}
