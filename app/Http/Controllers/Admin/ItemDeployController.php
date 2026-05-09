<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use Illuminate\Http\Request;

class ItemDeployController extends Controller
{
    /**
     * Deploy all variants of an item to a store.
     *
     * For each ItemVariant that does not yet have a StoreVariant record
     * in the target store, we create one with default stock=0, price=0.
     * Existing records are left untouched (idempotent).
     */
    public function deploy(Request $request, Item $item)
    {
        $request->validate([
            'store_id' => 'required|exists:stores,id',
        ]);

        $store = Store::findOrFail($request->store_id);

        $item->load('variants');

        $created = 0;

        foreach ($item->variants as $variant) {
            $alreadyExists = StoreVariant::where('item_id', $item->id)
                ->where('item_variant_id', $variant->id)
                ->where('store_id', $store->id)
                ->exists();

            if (!$alreadyExists) {
                StoreVariant::create([
                    'item_id'         => $item->id,
                    'item_variant_id' => $variant->id,
                    'store_id'        => $store->id,
                    'stock'           => 0,
                    'price'           => 0,
                    'status'          => 'inactive', // staff can activate after setting price/stock
                ]);
                $created++;
            }
        }

        $message = $created > 0
            ? "{$created} variant(s) deployed to {$store->name}. Set stock & price in Inventory."
            : "All variants were already deployed to {$store->name}.";

        return back()->with('success', $message);
    }
}
