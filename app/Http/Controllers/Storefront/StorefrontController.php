<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Http\Controllers\Controller;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Services\CartService;
use App\Services\StorefrontCatalogService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Public buyer-facing storefront.
 *
 * Renders for anyone — signed in or not. The grid lists products; choosing a
 * variant happens on the item Show page, mirroring the seller journey. The
 * only gated step is checkout.
 */
class StorefrontController extends Controller
{
    public function __construct(
        private readonly StorefrontCatalogService $catalog,
        private readonly CartService $cartService,
    ) {
    }

    /**
     * Storefront homepage — one card per product.
     */
    public function index(Request $request): Response
    {
        $store = $this->catalog->resolveStore();

        if (! $store) {
            return Inertia::render('Guest/Dashboard/index', $this->emptyProps(
                'Our catalogue is not published yet. Please check back shortly.'
            ));
        }

        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';
        $categoryId = $request->integer('category_id') ?: null;

        $paginator = $this->catalog->paginateItems(
            $store,
            $search !== '' ? $search : null,
            $categoryId
        );

        $items = collect($paginator->items())
            ->map(fn (Item $item) => $this->catalog->presentItemCard($item, $store))
            ->values()
            ->all();

        return Inertia::render('Guest/Dashboard/index', [
            'store' => $this->presentStore($store),
            'items' => $items,
            'categories' => $this->catalog->categories($store),
            'cart' => $this->cartService->presentBuyerCart(
                $this->cartService->currentBuyerCart($store),
                $store
            ),
            'filters' => [
                'search' => $search,
                'category_id' => $categoryId,
            ],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'next_page_url' => $paginator->nextPageUrl(),
                'total' => $paginator->total(),
            ],
            'error' => null,
        ]);
    }

    /**
     * Product detail — the shopper picks a colour / size / packaging
     * combination here and adds that variant to their cart.
     */
    public function show(Item $item): Response
    {
        $store = $this->catalog->resolveStore();

        abort_if($store === null, 404);
        abort_if($item->status !== 'active', 404);

        $detail = $this->catalog->presentItemDetail($item, $store);

        // An item with no active store variant is not on sale here.
        abort_if($detail['variants'] === [], 404);

        return Inertia::render('Guest/Dashboard/Show', [
            'store' => $this->presentStore($store),
            'item' => $detail,
            // The masthead keeps its category nav here so a shopper can jump
            // straight back into browsing from a product page.
            'categories' => $this->catalog->categories($store),
            'cart' => $this->cartService->presentBuyerCart(
                $this->cartService->currentBuyerCart($store),
                $store
            ),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function presentStore(Store $store): array
    {
        return [
            'id' => (int) $store->id,
            'name' => (string) $store->name,
            'location' => $store->location,
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function emptyProps(string $error): array
    {
        return [
            'store' => null,
            'items' => [],
            'categories' => [],
            'cart' => [
                'id' => null,
                'lines' => [],
                'item_count' => 0,
                'subtotal' => 0.0,
                'is_guest' => ! auth()->check(),
            ],
            'filters' => ['search' => '', 'category_id' => null],
            'pagination' => [
                'current_page' => 1,
                'last_page' => 1,
                'next_page_url' => null,
                'total' => 0,
            ],
            'error' => $error,
        ];
    }
}
