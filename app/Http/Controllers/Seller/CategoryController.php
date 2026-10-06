<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Item\ItemCategory;
use App\Services\Seller\SellerCatalog;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CategoryController extends Controller
{
    /**
     * Departments (top-level categories) in a rail, and the selected one's
     * subcategories beside it. Categories are two levels deep, so a
     * department's product count is its own active items plus its children's.
     * Corresponds to the route: seller.categories.index
     */
    public function index(Request $request, SellerCatalog $catalog)
    {
        $all = ItemCategory::withCount('items as active_items_count')
            ->orderBy('category_name')
            ->get(['id', 'category_name', 'parent_id']);

        $children = $all->whereNotNull('parent_id')->groupBy('parent_id');

        $mainCategories = $all->whereNull('parent_id')->values()->map(fn (ItemCategory $c) => [
            'id' => $c->id,
            'category_name' => $c->category_name,
            'product_count' => $c->active_items_count
                + (int) ($children->get($c->id)?->sum('active_items_count') ?? 0),
        ]);

        // Fallback: with no category_id, open the first department.
        $selectedId = $request->integer('category_id') ?: $mainCategories->first()['id'] ?? null;
        $selectedCategory = $mainCategories->firstWhere('id', $selectedId);

        $subcategories = $selectedCategory
            ? ($children->get($selectedCategory['id']) ?? collect())->values()->map(fn (ItemCategory $c) => [
                'id' => $c->id,
                'category_name' => $c->category_name,
                'active_items_count' => $c->active_items_count,
            ])
            : collect();

        // The department's best seller at this store; null until something sells.
        $storeId = $request->user()->store?->id;
        $featuredItem = $selectedCategory && $storeId
            ? $catalog->bestSeller((int) $storeId, $subcategories->pluck('id')->push($selectedCategory['id']))
            : null;

        // Same cart flags the Store page hands its ProductCards.
        $context = $catalog->cartContext($request->user(), $request->integer('cart_id') ?: null);

        return Inertia::render('Seller/Categories/Index', [
            'mainCategories' => $mainCategories,
            'selectedCategory' => $selectedCategory,
            'subcategories' => $subcategories,
            'subcategoryCount' => $all->whereNotNull('parent_id')->count(),
            'featuredItem' => $featuredItem,
            'has_tin_cart' => $context['has_tin_cart'],
            'top_cart_is_individual' => $context['top_cart_is_individual'],
        ]);
    }

    /**
     * Display the specified category, showing its subcategories (children).
     * Corresponds to the route: seller.categories.show
     */
    public function show(Request $request, ItemCategory $category, SellerCatalog $catalog)
    {
        $subcategories = $category->children()
            ->withCount('items as active_items_count')
            ->orderBy('category_name')
            ->get();

        // Only what this store carries, as the same cards the Store page shows.
        $storeId = $request->user()->store?->id;
        $context = $catalog->cartContext($request->user(), $request->integer('cart_id') ?: null);

        $items = $storeId
            ? $catalog->query((int) $storeId)
                ->where('items.item_category_id', $category->id)
                ->orderBy('product_name')
                ->get()
                ->map(fn ($item) => $catalog->present($item, (int) $storeId, $context['customer']))
                ->values()
            : collect();

        return Inertia::render('Seller/Categories/Show', [
            'category' => $category,
            'subcategories' => $subcategories,
            'items' => $items,
            'has_tin_cart' => $context['has_tin_cart'],
            'top_cart_is_individual' => $context['top_cart_is_individual'],
        ]);
    }

    // The remaining resource methods (create, store, edit, update, destroy)
    // are typically not needed for a Seller role who only views categories.
    // They are left commented out or empty if the Seller should not modify the structure.

    public function create()
    {
        // Return view for creating a new category if needed
    }

    public function store(Request $request)
    {
        // Logic to save a new category if allowed
    }

    public function edit(ItemCategory $category)
    {
        // Return view for editing a category if needed
    }

    public function update(Request $request, ItemCategory $category)
    {
        // Logic to update an existing category if allowed
    }

    public function destroy(ItemCategory $category)
    {
        // Logic to delete a category if allowed
    }
}
