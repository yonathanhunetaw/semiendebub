<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\Customer;
use App\Models\Finance\Sale;
use App\Models\Item\Item;
use App\Services\Admin\ActiveStore;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The top bar's search: orders by reference, customers by name or phone, and
 * items by name. Read-only. Orders and customers follow the active store;
 * items are the global catalogue, so a store admin (who cannot open the
 * catalogue) is pointed at their store's capacity screen for that item.
 */
class QuickSearchController extends Controller
{
    private const LIMIT = 5;

    public function __invoke(Request $request, ActiveStore $activeStore): JsonResponse
    {
        $term = trim((string) $request->query('q', ''));

        if (mb_strlen($term) < 2) {
            return response()->json(['orders' => [], 'customers' => [], 'items' => []]);
        }

        $like = '%'.str_replace(['%', '_'], ['\%', '\_'], $term).'%';

        $orders = $activeStore->apply(Sale::query())
            ->with('store:id,name')
            ->where('reference_number', 'like', $like)
            ->latest('id')
            ->limit(self::LIMIT)
            ->get()
            ->map(fn (Sale $sale): array => [
                'label' => (string) $sale->reference_number,
                'detail' => $sale->store?->name,
                'href' => route('admin.orders.custody', $sale->reference_number),
            ]);

        $customers = $activeStore->apply(Customer::query())
            ->with('store:id,name')
            ->where(fn ($q) => $q
                ->where('first_name', 'like', $like)
                ->orWhere('last_name', 'like', $like)
                ->orWhere('name', 'like', $like)
                ->orWhere('phone_number', 'like', $like)
                ->orWhere('phone', 'like', $like))
            ->orderBy('first_name')
            ->limit(self::LIMIT)
            ->get()
            ->map(fn (Customer $customer): array => [
                'label' => (string) ($customer->name ?: trim($customer->first_name.' '.$customer->last_name)),
                'detail' => collect([$customer->phone_number ?? $customer->phone, $customer->store?->name])->filter()->join(' · ') ?: null,
                // The customers screen has no detail page; it opens the list.
                'href' => route('admin.customers.index'),
            ]);

        $global = $activeStore->isGlobal();

        $items = Item::query()
            ->where('product_name', 'like', $like)
            ->orderBy('product_name')
            ->limit(self::LIMIT)
            ->get(['id', 'product_name'])
            ->map(fn (Item $item): array => [
                'label' => (string) $item->product_name,
                'detail' => null,
                'href' => $global
                    ? route('admin.items.show', $item->id)
                    : route('admin.inventory.capacity.index', ['search' => $item->product_name]),
            ]);

        return response()->json([
            'orders' => $orders->values(),
            'customers' => $customers->values(),
            'items' => $items->values(),
        ]);
    }
}
