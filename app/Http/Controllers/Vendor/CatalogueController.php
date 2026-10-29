<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Services\Vendor\VendorStore;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/** What the vendor's store lists, at its own prices. Prices and stock are changed in the admin app. */
class CatalogueController extends Controller
{
    public function __construct(private readonly VendorStore $vendors)
    {
    }

    public function index(Request $request): Response
    {
        $store = $this->vendors->storeFor($request->user(), $request->integer('store') ?: null);
        $search = trim((string) $request->query('search', '')) ?: null;

        return Inertia::render('Vendor/Catalogue/index', [
            'store' => $store ? $this->vendors->profile($store) : null,
            'items' => $store ? $this->vendors->catalogue($store, $search) : null,
            'filters' => ['search' => $search],
        ]);
    }
}
