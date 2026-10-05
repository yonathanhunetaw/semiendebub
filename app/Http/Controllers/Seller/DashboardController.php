<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Models\Seller\Cart;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use App\Services\Seller\SellerCatalog;
use Carbon\Carbon;

class DashboardController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $user = Auth::user();
        $store = $user->store;

        if (!$store) {
            return Inertia::render('Seller/Items/Index', [
                'items' => [],
                'store' => null,
                'error' => 'No store associated with this account.',
                'nextPageUrl' => null,
                'filters' => ['search' => '', 'cart_id' => null],
                'categories' => [],
                'has_tin_cart' => false,
            ]);
        }

        $storeId = $store->id;
        $perPage = 20;
        $search = $request->filled('search') ? trim($request->search) : null;

        $catalog = app(SellerCatalog::class);
        $categoryId = $request->integer('category_id') ?: null;

        // The cart prices are quoted for (?cart_id=, else the top open cart).
        $context = $catalog->cartContext($user, $request->integer('cart_id') ?: null);
        $customer = $context['customer'];

        // 🔹 1. Active items this store carries (shared with ItemController)
        $query = $catalog->query($storeId);

        if ($search) {
            $query->where('product_name', 'LIKE', '%' . $search . '%');
        }

        if ($categoryId) {
            $query->where('item_category_id', $categoryId);
        }

        $paginator = $query->orderBy('product_name')->paginate($perPage);
        $items = collect($paginator->items())->map(function ($item) use ($catalog, $storeId, $customer) {
            return $catalog->present($item, $storeId, $customer);
        });

        // 🔹 2. Return the exact same structure as ItemController::index
        $props = [
            'items'       => $items,
            'store'       => $store,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'filters'     => [
                'search'  => $search ?? '',
                'cart_id' => $request->integer('cart_id') ?: null,
                'category_id' => $categoryId,
            ],
            // Every category the store carries, not just this page's, so the
            // filter pills stay put while the grid is filtered or paged.
            'categories'           => $catalog->categories($storeId),
            'has_tin_cart'         => $context['has_tin_cart'],
            'top_cart_is_individual' => $context['top_cart_is_individual'],
        ];

        \Log::info('Seller Dashboard Props', $props);

        return Inertia::render('Seller/Items/Index', $props);
    }
}
