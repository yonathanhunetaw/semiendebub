<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Services\StockKeeperService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The two JSON steps behind the item → variant picker (Components/Shared/
 * ItemVariantPicker): items matching a search, then one item's variants.
 * `location` limits both to what that stock location holds.
 */
class ItemPickerController extends Controller
{
    public function __construct(private readonly StockKeeperService $stock) {}

    public function items(Request $request): JsonResponse
    {
        return response()->json([
            'items' => $this->stock->itemOptions(
                $request->string('q')->trim()->toString() ?: null,
                atLocationId: $request->integer('location') ?: null,
            )->all(),
        ]);
    }

    public function variants(Request $request, int $item): JsonResponse
    {
        return response()->json([
            'variants' => $this->stock->variantOptionsForItem($item, $request->integer('location') ?: null)->all(),
        ]);
    }
}
