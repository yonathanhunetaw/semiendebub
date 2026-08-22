<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\Customer;
use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
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
        
        $activeSessions = DB::table('sessions')
            ->where('last_activity', '>', $now - (config('session.lifetime') * 60))
            ->get();
            
        $sessionsCount = $activeSessions->count();
        
        $userIds = $activeSessions->whereNotNull('user_id')->pluck('user_id')->unique();
        $users = \App\Models\Auth\User::with('roles')->whereIn('id', $userIds)->get();
        
        $sessionRoles = $users->map(function ($user) {
            return $user->roles->pluck('name')->first() ?? 'Unknown';
        })->countBy();
        
        // Ensure some default roles show up even if 0
        $rolesBreakdown = collect(['admin' => 0, 'delivery' => 0, 'stockkeeper' => 0, 'seller' => 0])
            ->merge($sessionRoles);

        // Get Open Carts Breakdown (match exactly what the admin sees on Carts page)
        $allOpenCarts = \App\Models\Seller\Cart::with('customer')->visibleTo(Auth::user())->get();
        $openCartsCount = $allOpenCarts->count();
        $cartsBreakdown = $allOpenCarts->map(function($cart) {
            return ($cart->customer && $cart->customer->tin_number) ? 'business' : 'individual';
        })->countBy();
        
        $cartsBreakdownData = collect(['individual' => 0, 'business' => 0])->merge($cartsBreakdown);

        // Count customers
        $customersCount = Customer::count();

        // Active products
        $productsCount = Item::where('status', 'active')->count();

        // Active variants (only belonging to active products)
        // Active variants with their combination names
        $activeVariants = ItemVariant::with([
            'item',              // the product
            'itemPackagingType', // packaging
            'itemColor',         // color
            'itemSize',          // size
        ])
            ->where('status', 'active')
            ->get();
        // In your controller or before passing to the view
        $groupedProducts = $activeVariants->groupBy('item.product_name')->map(function ($variants, $productName) {
            return [
                'variants' => $variants,
                'colors_count' => $variants->pluck('itemColor.name')->filter()->unique()->count(),
                'sizes_count' => $variants->pluck('itemSize.name')->filter()->unique()->count(),
                'packaging_count' => $variants->pluck('itemPackagingType.name')->filter()->unique()->count(),
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

        $stores = \App\Models\Store\Store::select('id', 'name')->get();
        $storeName = request()->query('store', 'all');

        $lowStockQuery = \App\Models\Store\StoreVariant::with(['item', 'store'])
            ->where('stock', '<=', 5);

        if ($storeName && $storeName !== 'all') {
            $lowStockQuery->whereHas('store', function($q) use ($storeName) {
                $q->where('name', $storeName);
            });
        }

        $lowStockItems = $lowStockQuery->paginate(5)->withQueryString()->through(function ($sv) {
            return [
                'item_id' => $sv->id,
                'product_name' => $sv->item ? $sv->item->product_name : 'Unknown Product',
                'store_name' => $sv->store ? $sv->store->name : 'Unknown Store',
                'total_stock' => $sv->stock,
                'low_stock_total' => $sv->stock,
                'is_low' => true,
            ];
        });

        // DashboardController.php

        return Inertia::render('Admin/Dashboard/index', [
            'sessionsCount' => $sessionsCount,
            'rolesBreakdown' => $rolesBreakdown,
            'openCartsCount' => $openCartsCount,
            'cartsBreakdown' => $cartsBreakdownData,
            'customersCount' => $customersCount,
            'productsCount' => $productsCount,
            'activeVariantsCount' => $activeVariantsCount,
            'lowStockItems' => $lowStockItems,
            'groupedProducts' => $groupedProducts,
            'stores' => $stores,
            'currentStore' => $storeName,
        ]);

    }
}
