<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Services\Item\ItemDeployer;
use Illuminate\Http\Request;

class ItemDeployController extends Controller
{
    public function __construct(private readonly ItemDeployer $deployer)
    {
    }

    /**
     * Deploy all variants of an item to a store.
     *
     * For each ItemVariant that does not yet have a StoreVariant record
     * in the target store, we create one with default stock=0 and an empty
     * pricing matrix. Existing records are left untouched (idempotent).
     *
     * Deployed variants arrive switched off and unpriced, so an item can never be
     * sold for a price nobody chose. Saving a real price (item setup page, Prices)
     * switches the variant on; `active` is what both seller catalogues filter on.
     */
    public function deploy(Request $request, Item $item)
    {
        $request->validate([
            'store_id' => 'required|exists:stores,id',
        ]);

        $store = Store::findOrFail($request->store_id);

        // Imagery is no longer a condition of deployment: a variant with no photograph renders
        // PackagingPlaceholder rather than a broken image.
        $item->load('variants.itemPackagingType');
        $created = $this->deployer->deploy($item, $store);

        $message = $created > 0
            ? "{$created} variant(s) deployed to {$store->name}. Set its price to put it on sale."
            : "All variants were already deployed to {$store->name}.";

        return back()->with('success', $message);
    }
}
