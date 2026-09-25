<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\Procurement\Purchase;
use App\Services\VendorService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Orders the business has placed with this vendor.
 *
 * Read-only by design: a supplier sees what was ordered, but only Procurement
 * may change an order's state.
 */
class PurchaseOrderController extends Controller
{
    public function __construct(private readonly VendorService $vendors)
    {
    }

    public function index(Request $request): Response
    {
        $vendor = Auth::user();

        $status = $request->string('status')->toString() ?: 'all';
        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';

        $paginator = $this->vendors->paginateOrders(
            $vendor,
            $status,
            $search !== '' ? $search : null,
        );

        return Inertia::render('Vendor/Orders/index', [
            'orders' => collect($paginator->items())
                ->map(fn (Purchase $purchase) => $this->vendors->presentOrder($purchase))
                ->values()
                ->all(),
            'counts' => $this->vendors->orderStatusCounts($vendor),
            'metrics' => $this->vendors->metrics($vendor),
            'filters' => ['status' => $status, 'search' => $search],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Purchase $purchase): Response
    {
        // A vendor may only open their own orders.
        abort_if((int) $purchase->vendor_id !== (int) Auth::id(), 403);

        $purchase->load(['store', 'warehouse', 'user']);

        return Inertia::render('Vendor/Orders/Show', [
            'order' => $this->vendors->presentOrder($purchase),
        ]);
    }
}
