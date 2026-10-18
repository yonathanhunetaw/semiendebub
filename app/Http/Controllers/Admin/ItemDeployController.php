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
     * Deployed variants arrive active. They used to arrive inactive, which
     * made "deploy" a half step: `active` is what Seller\DashboardController
     * and Seller\ItemController filter their catalogue on, so a deployed item
     * was invisible to the store's own sellers until somebody walked the
     * variant list and switched each row on by hand. `active` is still the
     * admin's switch — updateVariant() turns a row back off — it just starts
     * in the position that makes deployment mean something.
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
            ? "{$created} variant(s) deployed to {$store->name}. Set stock & price in Inventory."
            : "All variants were already deployed to {$store->name}.";

        return back()->with('success', $message);
    }
}
