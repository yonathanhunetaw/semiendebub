<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Store;

use App\Http\Controllers\Controller;
use App\Models\Inventory\Stocktake;
use App\Models\Store\Store;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\ReplenishmentProposalService;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The Store page: a hub of grouped cards (Stock, Movement, Approvals), laid out
 * like the seller's More page, instead of a tab bar over the items list. Each
 * tile opens one screen; the screens carry a back link to here.
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

        return Inertia::render('Admin/Stores/Hub', [
            'store' => ['id' => (int) $store->id, 'name' => $store->name],
            'counts' => [
                // Refills the planner proposes, waiting for a manager's ruling.
                'refills' => count($this->planner->pendingProposals((int) $store->id)),
                // Stocktakes a keeper submitted, waiting for someone else to approve.
                'counts' => Stocktake::query()
                    ->where('status', Stocktake::SUBMITTED)
                    ->when($scope !== null, fn ($query) => $this->activeStore->applyThrough($query, 'location'))
                    ->count(),
            ],
        ]);
    }
}
