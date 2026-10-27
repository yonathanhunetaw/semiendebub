<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Controllers\StockKeeper\Concerns\KeeperScope;
use App\Models\Item\Item;
use App\Services\Inventory\ItemLookup;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** An item as the stock keeper sees it, and the scanner's way in. */
class ItemController extends Controller
{
    use KeeperScope;

    public function __construct(private readonly ItemLookup $lookup)
    {
    }

    public function show(Request $request, Item $item): Response
    {
        return Inertia::render('StockKeeper/Items/Show', [
            'item' => $this->lookup->detail($item, $this->scopeIds($request->user())),
            'scanned_variant' => $request->integer('variant') ?: null,
        ]);
    }

    /** A scanned or typed barcode / SKU opens its item. */
    public function scan(Request $request): RedirectResponse
    {
        $code = trim($request->string('code')->toString());
        $variant = $this->lookup->findVariant($code);

        if ($variant === null) {
            return back()->with('error', "No item has the barcode or SKU \"{$code}\". Ask an admin to add it.");
        }

        return redirect()->to(\App\Support\StockKeepingRoutes::url('stock_keeper.items.show', ['item' => $variant->item_id, 'variant' => $variant->id]));
    }
}
