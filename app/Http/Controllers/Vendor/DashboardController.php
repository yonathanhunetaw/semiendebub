<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Services\Vendor\VendorStore;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** A vendor's first screen: their store, its figures and its latest orders. */
class DashboardController extends Controller
{
    public function __construct(private readonly VendorStore $vendors)
    {
    }

    public function index(Request $request): Response
    {
        $store = $this->vendors->storeFor($request->user(), $request->integer('store') ?: null);

        return Inertia::render('Vendor/Dashboard/index', [
            'store' => $store ? $this->vendors->profile($store) : null,
            'metrics' => $store ? $this->vendors->metrics($store) : null,
            'recent_orders' => $store ? $this->vendors->orders($store, null, 6)->items() : [],
            'choices' => $this->vendors->choices($request->user()),
        ]);
    }
}
