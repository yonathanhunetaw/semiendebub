<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Item\Item;
use App\Models\StockKeeper\ItemStock;
use App\Services\ImageResolver;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Inertia\Inertia;
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
            ]);
        }

        $storeId = $store->id;
        $perPage = 20;
        $search = $request->filled('search') ? trim($request->search) : null;

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
            'categories' => $categoryNames,  // 👈 now passed to the frontend
        ]);
    }

    /**
     * Enrich a single item with all required fields for the index page.
     * Now correctly sets original_price to the base price (non‑discounted)
     * and discount_price in the pricing_matrix.
     */
    private function enrichItemForIndex(Item $item, int $storeId): array
    {
        $bestFinalPrice = null;
        $bestBasePrice = null;
        $bestDiscountPrice = null;
        $bestDiscountEndsAt = null;
        $totalStock = 0;
        $bestMatrix = null;

        $generalImages = $item->general_images ?? [];
        if (is_string($generalImages)) {
            $decoded = json_decode($generalImages, true);
            $generalImages = is_array($decoded) ? $decoded : [];
        }

        $variantImages = collect();

        foreach ($item->variants as $variant) {
            // Variant images
            $raw = $variant->images ?? [];
            if (is_string($raw)) {
                $decoded = json_decode($raw, true);
                $raw = is_array($decoded) ? $decoded : [];
            }
            foreach ($raw as $img) {
                if (!empty($img)) {
                    $variantImages->push($this->resolveImageUrl($img));
                }
            }

            foreach ($variant->storeVariants as $storeVariant) {
                // Stock
                foreach ($storeVariant->stocks as $stock) {
                    $totalStock += (int) $stock->quantity;
                }

                // Pricing matrix
                $matrix = $storeVariant->pricing_matrix;
                if (is_string($matrix)) {
                    $matrix = json_decode($matrix, true);
                }

                $basePrice = (float) ($matrix['price'] ?? 0);
                $discountPrice = isset($matrix['discount_price']) && $matrix['discount_price'] !== null
                    ? (float) $matrix['discount_price']
                    : null;
                $discountEndsAt = $matrix['discount_ends_at'] ?? null;

                $isDiscountActive = $discountPrice !== null
                    && $discountPrice > 0
                    && $discountPrice < $basePrice
                    && ($discountEndsAt === null || Carbon::now()->lt(Carbon::parse($discountEndsAt)));

                $finalPrice = $isDiscountActive ? $discountPrice : $basePrice;

                // We want the lowest final price across all variants
                if ($bestFinalPrice === null || $finalPrice < $bestFinalPrice) {
                    $bestFinalPrice = $finalPrice;
                    $bestBasePrice = $basePrice;
                    $bestDiscountPrice = $isDiscountActive ? $discountPrice : null;
                    $bestDiscountEndsAt = $isDiscountActive ? $discountEndsAt : null;
                    $bestMatrix = $matrix;
                }
            }
        }

        // Now set the item-level fields
        $originalPrice = $bestBasePrice ?? 0;
        $finalPrice = $bestFinalPrice ?? $originalPrice;

        // If there's a discount, ensure the matrix reflects it
        $discountPriceForMatrix = ($bestDiscountPrice !== null && $bestDiscountPrice < $originalPrice)
            ? $bestDiscountPrice
            : null;

        $imageUrls = collect($generalImages)
            ->map(fn($path) => $this->resolveImageUrl($path))
            ->merge($variantImages)
            ->filter()
            ->unique()
            ->values()
            ->toArray();

        return [
            'id'           => $item->id,
            'product_name' => $item->product_name,
            'sold_count'   => $item->sold_count ?? 0,
            'category'     => $item->category ? ['category_name' => $item->category->category_name] : null,
            'image_urls'   => $imageUrls,
            'original_price' => $originalPrice,
            'final_price'  => $finalPrice,
            'discount_ends_at' => $bestDiscountEndsAt, // also at top level for convenience
            'store_stock'  => $totalStock,
            'pricing_matrix' => [
                'price'           => $originalPrice,
                'discount_price'  => $discountPriceForMatrix,
                'discount_ends_at' => $bestDiscountEndsAt,
            ],
        ];
    }

    private function resolveImageUrl(?string $path): ?string
    {
        if (empty($path)) return null;
        if (str_starts_with($path, 'http')) return $path;

        $baseUrl = config('filesystems.disks.s3.url') ?? env('AWS_URL', 'http://duka.test:9000/duka-images');
        return $baseUrl . '/' . ltrim($path, '/');
    }
}