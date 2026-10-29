<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\Finance\Sale;
use App\Services\Vendor\VendorStore;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** The orders customers placed with the vendor's store, read-only. */
class OrderController extends Controller
{
    public function __construct(private readonly VendorStore $vendors)
    {
    }

    public function index(Request $request): Response
    {
        $store = $this->vendors->storeFor($request->user(), $request->integer('store') ?: null);
        $stage = (string) $request->query('stage', 'all');

        return Inertia::render('Vendor/Orders/index', [
            'store' => $store ? $this->vendors->profile($store) : null,
            'orders' => $store ? $this->vendors->orders($store, $stage) : null,
            'stages' => Sale::fulfillmentStages(),
            'filters' => ['stage' => $stage],
        ]);
    }

    public function show(Request $request, Sale $sale): Response
    {
        $store = $this->vendors->storeFor($request->user(), (int) $sale->store_id);

        // Another store's order is not there, as far as this vendor is concerned.
        abort_if($store === null || (int) $store->id !== (int) $sale->store_id, 404);

        return Inertia::render('Vendor/Orders/Show', [
            'store' => $this->vendors->profile($store),
            'order' => $this->vendors->orderDetail($sale),
        ]);
    }
}
