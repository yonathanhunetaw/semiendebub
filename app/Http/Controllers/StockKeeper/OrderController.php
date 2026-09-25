<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Services\StockKeeperService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Outbound work queue.
 *
 * There is no `orders` table in this schema — an order in flight is a cart
 * that has been committed, so the picking queue is built from carts and the
 * variants they hold. Each line is checked against the ledger so the desk can
 * see what is actually pickable before they start.
 */
class OrderController extends Controller
{
    public function __construct(private readonly StockKeeperService $stock)
    {
    }

    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString() ?: 'all';

        $query = Cart::query()->with(['customer', 'seller', 'variants.item']);

        if ($status !== 'all') {
            $query->where('status', $status);
        }

        $paginator = $query->orderBy('priority')->orderByDesc('id')->paginate(20)->withQueryString();

        $carts = collect($paginator->items())
            ->map(fn (Cart $cart) => $this->presentCart($cart))
            ->values()
            ->all();

        $counts = Cart::query()
            ->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')
            ->pluck('total', 'status');

        return Inertia::render('StockKeeper/Orders/index', [
            'orders' => $carts,
            'filters' => ['status' => $status],
            'counts' => [
                'all' => (int) $counts->sum(),
                'open' => (int) ($counts['open'] ?? 0),
                'pending' => (int) ($counts['pending'] ?? 0),
            ],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * Shape one cart as a pick job, flagging any line the ledger cannot cover.
     *
     * @return array<string, mixed>
     */
    private function presentCart(Cart $cart): array
    {
        $lines = $cart->variants->map(function (ItemVariant $variant) use ($cart) {
            $required = (int) $variant->pivot->quantity;
            $onHand = (int) $variant->stocks()
                ->where('location_type', StockKeeperService::STORE_TYPE)
                ->where('location_id', $cart->store_id)
                ->sum('quantity');

            return [
                'variant_id' => (int) $variant->id,
                'product_name' => (string) ($variant->item?->product_name ?? 'Unknown product'),
                'sku' => $variant->sku,
                'required' => $required,
                'on_hand' => $onHand,
                'short_by' => max(0, $required - $onHand),
            ];
        })->values();

        return [
            'id' => (int) $cart->id,
            'reference' => 'CART-' . $cart->id,
            'status' => (string) $cart->status,
            'priority' => (int) $cart->priority,
            'customer' => $cart->customer?->name,
            'seller' => trim((string) ($cart->seller?->first_name . ' ' . $cart->seller?->last_name)) ?: null,
            'line_count' => $lines->count(),
            'unit_count' => (int) $lines->sum('required'),
            // A job is only pickable when every line is covered by the ledger.
            'shortfall_lines' => (int) $lines->where('short_by', '>', 0)->count(),
            'lines' => $lines->all(),
            'created_at' => $cart->created_at?->toIso8601String(),
        ];
    }
}
