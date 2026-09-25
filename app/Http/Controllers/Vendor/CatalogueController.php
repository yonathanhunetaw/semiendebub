<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\Item\ItemVariant;
use App\Services\VendorService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The SKUs this vendor supplies, with how many units sit in the network.
 */
class CatalogueController extends Controller
{
    public function __construct(private readonly VendorService $vendors)
    {
    }

    public function index(Request $request): Response
    {
        $vendor = Auth::user();
        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';

        $paginator = $this->vendors->paginateCatalogue(
            $vendor,
            $search !== '' ? $search : null,
        );

        $items = collect($paginator->items());
        $stock = $this->vendors->stockForVariants($items->pluck('id')->all());

        return Inertia::render('Vendor/Catalogue/index', [
            'variants' => $items
                ->map(fn (ItemVariant $variant) => $this->vendors->presentVariant($variant, $stock))
                ->values()
                ->all(),
            'metrics' => $this->vendors->metrics($vendor),
            'filters' => ['search' => $search],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }
}
