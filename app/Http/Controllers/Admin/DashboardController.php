<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\Customer;
use App\Models\Item;
use App\Models\ItemVariant;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;


class DashboardController extends Controller
{
    public function index()
    {
        // Count active sessions (not expired)
        $now = now()->timestamp;

        $sessionsCount = DB::table('sessions')
            ->where('last_activity', '>', $now - (config('session.lifetime') * 60))
            ->count();

        // Count customers
        $customersCount = Customer::count();

        // Active products
        $productsCount = Item::where('status', 'active')->count();

        // Active variants (only belonging to active products)
        // Active variants with their combination names
        $activeVariants = ItemVariant::with([
            'itemPackagingType', // packaging
            'color',             // color
            'size',              // size
        ])
            ->where('status', 'active')
            ->get();
        // In your controller or before passing to the view
        $groupedProducts = $activeVariants->groupBy('item.product_name')->map(function ($variants, $productName) {
            return [
                'variants' => $variants,
                'colors_count' => $variants->pluck('color.name')->unique()->count(),
                'sizes_count' => $variants->pluck('size.name')->unique()->count(),
                'packaging_count' => $variants->pluck('itemPackagingType.name')->unique()->count(),
            ];
        });

        // $seller = Auth::user();

        // $itemsCount = Item::whereHas('variants', function ($q) use ($seller) {
        //     $q->where('store_id', $seller->store_id); // <-- variants table has store_id
        // })->count();

        // Get the admin's store ID if needed, or null for all stores
        $storeId = Auth::user()->store_id; // optional, admin may see all

        $activeVariantsCount = ItemVariant::when($storeId, function ($query) use ($storeId) {
            $query->where('store_id', $storeId);
        })
            ->where('status', 'active')
            ->count();

        $lowStockItems = Item::with(['variants.storeVariants.stocks'])
            ->get()
            ->map(function ($item) {
                $totalStock = $item->variants->flatMap->stocks->sum('quantity');
                $lowStockTotal = $item->variants->flatMap->stocks
                    ->where('quantity', '<=', 5)
                    ->sum('quantity');

                return [
                    'item_id' => $item->id,
                    'product_name' => $item->product_name,
                    'total_stock' => $totalStock,
                    'low_stock_total' => $lowStockTotal,
                    'is_low' => $totalStock <= 5, // or any threshold you want
                ];
            })
            ->filter(fn($item) => $item['low_stock_total'] > 0);

        // DashboardController.php

        return Inertia::render('Admin/Dashboard/Index', [
            'sessionsCount' => $sessionsCount,
            'customersCount' => $customersCount,
            'productsCount' => $productsCount,
            'activeVariantsCount' => $activeVariantsCount,
            'lowStockItems' => $lowStockItems->values(), // values() resets keys for JSON
            'groupedProducts' => $groupedProducts,
        ]);

    }
}
