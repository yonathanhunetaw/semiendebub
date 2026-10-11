<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Store;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\UpdateBusinessPoolRequest;
use App\Models\Store\StoreVariant;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StockPools;
use App\Services\StockService;
use Illuminate\Http\JsonResponse;

/**
 * Stock set aside for Business customers on one store item (StockPools).
 * Answers JSON for the store inventory drawer, with the pools as they now
 * stand.
 */
class StockPoolController extends Controller
{
    public function update(UpdateBusinessPoolRequest $request, StoreVariant $storeVariant, StockService $stock, StockPools $pools): JsonResponse
    {
        // A store admin only sets pools at their own stores.
        $ids = ActiveStore::accessibleIdsFor($request->user());
        abort_if($ids !== null && ! in_array((int) $storeVariant->store_id, $ids, true), 404);

        $storeVariant->update(['business_pool' => $request->validated('business_pool')]);

        $itemVariantId = (int) $storeVariant->item_variant_id;
        $storeId = (int) $storeVariant->store_id;

        return response()->json([
            'business_pool' => $storeVariant->business_pool,
            'pools' => $pools->present($itemVariantId, $storeId, $stock->availableAtStore($itemVariantId, $storeId)),
        ]);
    }
}
