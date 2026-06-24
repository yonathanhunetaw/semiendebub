<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Models\Seller\Cart;
use App\Services\ImageResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
use App\Services\PriceProvider;
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

        // Fetch top open cart for the seller to check TIN logic
        $topCart = Cart::with('customer')
            ->where('seller_id', $user->id)
            ->where('status', 'open')
            ->orderBy('priority', 'asc')
            ->first();
            
        $hasTinCart = $topCart && $topCart->customer && !empty($topCart->customer->tin_number);

        // 🔹 1. Build the query – identical to ItemController::index
        $query = Item::where('status', 'active')
            ->with([
                'category',
                'variants' => function ($q) use ($storeId) {
                    $q->with([
                        'storeVariants' => function ($sq) use ($storeId) {
                            $sq->where('store_id', $storeId)
                                ->with([
                                    'stocks' => function ($stockQuery) use ($storeId) {
                                        $stockQuery->where('location_type', 'App\Models\Store\Store')
                                            ->where('location_id', $storeId);
                                    }
                                ]);
                        }
                    ]);
                },
            ]);

        $query->whereHas('variants.storeVariants', function ($q) use ($storeId) {
            $q->where('store_id', $storeId);
        });

        if ($search) {
            $query->where('product_name', 'LIKE', '%' . $search . '%');
        }

        $paginator = $query->orderBy('product_name')->paginate($perPage);
        $items = collect($paginator->items())->map(function ($item) use ($storeId) {
            return $this->enrichItemForIndex($item, $storeId);
        });

        // 🔹 2. Extract categories from the enriched items
        $categoryNames = $items
            ->pluck('category.category_name')
            ->filter()
            ->unique()
            ->values()
            ->toArray();

        // 🔹 3. Return the exact same structure as ItemController::index
        return Inertia::render('Seller/Items/Index', [
            'items' => $items,
            'store' => $store,
            'nextPageUrl' => $paginator->nextPageUrl(),
            'filters' => [
                'search' => $search ?? '',
                'cart_id' => $request->integer('cart_id') ?: null,
            ],
            'categories' => $categoryNames,
            'has_tin_cart' => $hasTinCart,
        ]);
    }

    /**
     * Enrich a single item with all required fields for the index page.
     * Now correctly sets original_price to the base price (non‑discounted)
     * and discount_price in the pricing_matrix.
     */
    private function enrichItemForIndex(Item $item, int $storeId): array
    {
        // 1. Restore Image Resolution Logic
        $generalImages = is_string($item->general_images) ? json_decode($item->general_images, true) : ($item->general_images ?? []);

        $variantImages = collect();
        foreach ($item->variants as $variant) {
            $raw = is_string($variant->images) ? json_decode($variant->images, true) : ($variant->images ?? []);
            foreach ((array) $raw as $img) {
                if (!empty($img))
                    $variantImages->push($this->resolveImageUrl($img));
            }
        }

        $imageUrls = collect((array) $generalImages)
            ->map(fn($path) => $this->resolveImageUrl($path))
            ->merge($variantImages)
            ->filter()
            ->unique()
            ->values()
            ->toArray();

        // 2. Pricing and Stock logic
        $storeVariant = $item->variants->flatMap->storeVariants
            ->where('store_id', $storeId)
            ->first();

        $totalStock = 0;
        foreach ($item->variants as $variant) {
            foreach ($variant->storeVariants->where('store_id', $storeId) as $sv) {
                $totalStock += (int) $sv->stocks->sum('quantity');
            }
        }

        // 3. USE THE PRICE PROVIDER (Matches your Frontend expectation)
        $priceLadder = $storeVariant
            ? PriceProvider::getPriceLadder($storeVariant->id, $storeId)
            : [];

        $finalPrice = PriceProvider::getFinalPrice($priceLadder);
        $basePrice = $priceLadder[0]['price'] ?? 0;
        
        $matrix = $storeVariant ? $storeVariant->pricing_matrix : null;
        if (is_string($matrix)) {
            $matrix = json_decode($matrix, true);
        }
        $discountEndsAt = $matrix['discount_ends_at'] ?? null;

        return [
            'id' => $item->id,
            'product_name' => $item->product_name,
            'sold_count' => $item->sold_count ?? 0,
            'category' => $item->category ? ['category_name' => $item->category->category_name] : null,
            'image_urls' => $imageUrls,
            'store_price' => $basePrice,
            'original_price' => $basePrice,
            'final_price' => $finalPrice,
            'store_stock' => $totalStock,
            'pricing_matrix' => $matrix ?: null,
            'discount_ends_at' => $discountEndsAt,
        ];
    }

    private function resolveImageUrl(?string $path): ?string
    {
        if (empty($path))
            return null;
        if (str_starts_with($path, 'http'))
            return $path;

        $baseUrl = config('filesystems.disks.s3.url') ?? env('AWS_URL', 'http://duka.test:9000/duka-images');
        return $baseUrl . '/' . ltrim($path, '/');
    }
}