<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Http\Requests\Vendor\UpdateVendorStoreRequest;
use App\Models\Store\Store;
use App\Services\Vendor\VendorStore;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** The store's public face: its address on the shop, what it says about itself, how to reach it. */
class StoreProfileController extends Controller
{
    public function __construct(private readonly VendorStore $vendors)
    {
    }

    public function index(Request $request): Response
    {
        $store = $this->vendors->storeFor($request->user(), $request->integer('store') ?: null);

        return Inertia::render('Vendor/Store/index', [
            'store' => $store ? $this->vendors->profile($store) : null,
        ]);
    }

    public function update(UpdateVendorStoreRequest $request): RedirectResponse
    {
        $asked = (int) $request->validated('store_id');
        $store = $this->vendors->storeFor($request->user(), $asked);

        // Only the store this person runs (a global admin: any vendor store).
        abort_if($store === null || (int) $store->id !== $asked, 403);

        $store->update($request->safe()->only(['description', 'contact_phone', 'contact_email', 'slug']));

        return back()->with('success', 'Store profile saved.');
    }
}
