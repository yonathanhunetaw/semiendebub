<?php

declare(strict_types=1);

namespace App\Http\Controllers\Vendor;

use App\Http\Controllers\Controller;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Purchase;
use App\Services\VendorService;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Supplier overview: what they supply, and what has been ordered from them.
 */
class DashboardController extends Controller
{
    public function __construct(private readonly VendorService $vendors)
    {
    }

    public function index(): Response
    {
        $vendor = Auth::user();

        $recentOrders = Purchase::query()
            ->forVendor((int) $vendor->id)
            ->with(['store', 'warehouse', 'user'])
            ->orderByDesc('id')
            ->limit(6)
            ->get()
            ->map(fn (Purchase $purchase) => $this->vendors->presentOrder($purchase))
            ->values()
            ->all();

        $topVariants = ItemVariant::query()
            ->where('owner_id', $vendor->id)
            ->with(['item.category', 'itemColor', 'itemSize', 'itemPackagingType'])
            ->orderByDesc('id')
            ->limit(6)
            ->get();

        $stock = $this->vendors->stockForVariants($topVariants->pluck('id')->all());

        return Inertia::render('Vendor/Dashboard/index', [
            'metrics' => $this->vendors->metrics($vendor),
            'recent_orders' => $recentOrders,
            'catalogue_preview' => $topVariants
                ->map(fn (ItemVariant $variant) => $this->vendors->presentVariant($variant, $stock))
                ->values()
                ->all(),
            'vendor' => [
                'id' => (int) $vendor->id,
                'name' => trim($vendor->first_name . ' ' . $vendor->last_name),
                'email' => $vendor->email,
            ],
        ]);
    }
}
