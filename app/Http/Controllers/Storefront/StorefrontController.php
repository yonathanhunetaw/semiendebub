<?php

declare(strict_types=1);

namespace App\Http\Controllers\Storefront;

use App\Http\Controllers\Controller;
use App\Models\Item\Item;
use App\Models\Store\Store;
use App\Services\CartService;
use App\Services\StorefrontCatalogService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Illuminate\Support\Str;
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
        $store = $this->catalog->storeForRequest($request);

        // /s/{slug} for a store that is not open is not there.
        abort_if($store === null && $request->route('store') !== null, 404);

        if (! $store) {
            return Inertia::render('User/Dashboard/index', $this->emptyProps(
                'Our catalogue is not published yet. Please check back shortly.'
            ));
        }

        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';
        $categoryId = $request->integer('category_id') ?: null;

        // Ordering and the two availability switches. An unknown sort falls back
        // to the default rather than erroring — these arrive from a query string
        // a shopper can edit or share.
        $sort = in_array(
            $request->string('sort')->toString(),
            StorefrontCatalogService::SORTS,
            true
        ) ? $request->string('sort')->toString() : StorefrontCatalogService::SORT_NAME;

        $inStock = $request->boolean('in_stock');
        $onSale = $request->boolean('on_sale');

        View::share('seo', [
            'title' => $store->name . ' — Stationery and office supplies',
            'description' => 'Browse ' . $store->name . ': stationery, office and school supplies, with prices in ETB.',
            'canonical' => route('storefront.index'),
            // Search, filters and later pages are the same catalogue again.
            'noindex' => $search !== '' || $categoryId !== null || $request->filled('page'),
        ]);

        $paginator = $this->catalog->paginateItems(
            $store,
            $search !== '' ? $search : null,
            $categoryId,
            null,
            ['sort' => $sort, 'in_stock' => $inStock, 'on_sale' => $onSale],
        );

        $items = collect($paginator->items())
            ->map(fn (Item $item) => $this->catalog->presentItemCard($item, $store))
            ->values()
            ->all();

        return Inertia::render('User/Dashboard/index', [
            'store' => $this->presentStore($store),
            // The store's reviews, and whether this shopper may write one.
            'reviews' => app(\App\Services\Storefront\StoreReviews::class)->forStorePage($store, $request->user()),
            'items' => $items,
            'categories' => $this->catalog->categories($store),
            'cart' => $this->cartService->presentBuyerCart(
                $this->cartService->currentBuyerCart($store),
                $store
            ),
            // Everything the shopper has in other stores too: one basket, one order per store.
            'basket' => $this->cartService->presentBasket(),
            'filters' => [
                'search' => $search,
                'category_id' => $categoryId,
                'sort' => $sort,
                'in_stock' => $inStock,
                'on_sale' => $onSale,
            ],
            'sorts' => $this->sortOptions(),
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
    public function show(Request $request, Item $item): Response
    {
        $store = $this->catalog->storeForRequest($request);

        abort_if($store === null, 404);
        abort_if($item->status !== 'active', 404);

        $detail = $this->catalog->presentItemDetail($item, $store);

        // An item with no active store variant is not on sale here.
        abort_if($detail['variants'] === [], 404);

        View::share('seo', $this->itemSeo($detail, $store));

        return Inertia::render('User/Dashboard/Show', [
            'store' => $this->presentStore($store),
            'item' => $detail,
            // The masthead keeps its category nav here so a shopper can jump
            // straight back into browsing from a product page.
            'categories' => $this->catalog->categories($store),
            'cart' => $this->cartService->presentBuyerCart(
                $this->cartService->currentBuyerCart($store),
                $store
            ),
            // Everything the shopper has in other stores too: one basket, one order per store.
            'basket' => $this->cartService->presentBasket(),
            // Same shelf, same store — a shopper who has ruled this one out has
            // somewhere to go that is not the back button.
            'related' => $this->catalog->relatedItems($item, $store),
        ]);
    }

    /**
     * Head data for a product page: title, description, image and schema.org
     * Product markup (price range and availability) for search and AI answers.
     *
     * @param  array<string, mixed>  $detail
     * @return array<string, mixed>
     */
    private function itemSeo(array $detail, Store $store): array
    {
        $url = route('storefront.items.show', $detail['id']);
        $description = Str::limit(trim(strip_tags((string) ($detail['description'] ?? ''))), 160)
            ?: 'Buy ' . $detail['title'] . ' from ' . $store->name . '.';
        $image = $detail['images'][0] ?? null;

        $prices = collect($detail['variants'])->pluck('final_price')->filter(fn ($p) => $p !== null);

        $product = [
            '@context' => 'https://schema.org',
            '@type' => 'Product',
            'name' => $detail['title'],
            'description' => $description,
            'url' => $url,
        ];

        if ($image) {
            $product['image'] = $image;
        }

        if ($detail['category']) {
            $product['category'] = $detail['category']['name'];
        }

        if ($prices->isNotEmpty()) {
            $product['offers'] = [
                '@type' => 'AggregateOffer',
                'priceCurrency' => 'ETB',
                'lowPrice' => (float) $prices->min(),
                'highPrice' => (float) $prices->max(),
                'offerCount' => $prices->count(),
                'availability' => $detail['available_stock'] > 0
                    ? 'https://schema.org/InStock'
                    : 'https://schema.org/OutOfStock',
            ];
        }

        return [
            'title' => $detail['title'] . ' — ' . $store->name,
            'description' => $description,
            'canonical' => $url,
            'image' => $image ? url($image) : null,
            'og_type' => 'product',
            'json_ld' => $product,
        ];
    }

    /**
     * Labels for the sort control.
     *
     * @return array<int, array{value: string, label: string}>
     */
    private function sortOptions(): array
    {
        return [
            ['value' => StorefrontCatalogService::SORT_NAME, 'label' => 'Name A–Z'],
            ['value' => StorefrontCatalogService::SORT_NEWEST, 'label' => 'Newest'],
            ['value' => StorefrontCatalogService::SORT_PRICE_ASC, 'label' => 'Price: low to high'],
            ['value' => StorefrontCatalogService::SORT_PRICE_DESC, 'label' => 'Price: high to low'],
        ];
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
            'slug' => $store->slug,
            'description' => $store->description,
            // On /s/{slug} the cart and checkout must name the store; on /shop they do not.
            'explicit' => request()->route('store') !== null,
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
                // Matches CartService::presentBuyerCart() so the drawer's
                // contract holds even on the unavailable-storefront path.
                'sourcing_groups' => [],
                'requires_delay_agreement' => false,
                'delayed_line_count' => 0,
            ],
            'filters' => [
                'search' => '',
                'category_id' => null,
                'sort' => StorefrontCatalogService::SORT_NAME,
                'in_stock' => false,
                'on_sale' => false,
            ],
            'sorts' => $this->sortOptions(),
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
