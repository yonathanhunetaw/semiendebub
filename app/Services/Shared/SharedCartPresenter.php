<?php

declare(strict_types=1);

namespace App\Services\Shared;

use App\Models\Auth\CustomerAddress;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\Seller\CartShare;
use App\Models\Store\StoreVariant;
use App\Services\CartService;
use App\Services\Fulfillment\CustodyLog;
use App\Services\Fulfillment\OrderSourcingService;
use App\Services\Fulfillment\SellerOrderBoard;
use App\Services\StockService;

/**
 * What the customer sees on a shared link (types/sharedCart.ts). Only what
 * concerns them: their prices, availability as in stock / a day / not
 * available, their own addresses, the store's accounts to pay into, and
 * their order's progress. Never stock counts, locations, staff names, cost,
 * margin or anyone else's prices.
 */
class SharedCartPresenter
{
    public function __construct(
        private readonly CartService $carts,
        private readonly OrderSourcingService $sourcing,
        private readonly CartShareService $shares,
    ) {
    }

    /** @return array<string, mixed> */
    public function cart(CartShare $share): array
    {
        $cart = $share->cart()->with(['store', 'seller', 'customer', 'variants.item', 'variants.itemColor', 'variants.itemSize', 'variants.itemPackagingType'])->firstOrFail();
        $store = $cart->store;
        $grouped = $store ? $this->sourcing->groupCart($cart, $store) : ['groups' => [], 'requires_agreement' => false];

        $availability = [];
        foreach ($grouped['groups'] as $group) {
            foreach ($group['lines'] as $line) {
                $availability[$line['variant_id']] = match (true) {
                    ! $line['fully_covered'] => ['state' => 'unavailable', 'text' => 'Not enough in stock'],
                    $group['requires_agreement'] => ['state' => 'later', 'text' => (string) $group['promise']],
                    default => ['state' => 'now', 'text' => (string) $group['promise']],
                };
            }
        }

        $lines = $cart->variants->map(fn (ItemVariant $v) => [
            'variant_id' => (int) $v->id,
            'title' => (string) ($v->item?->product_name ?? 'Item'),
            'detail' => collect([$v->itemColor?->name, $v->itemSize?->name])->filter()->implode(' · ') ?: null,
            'unit' => $v->itemPackagingType?->name ?? 'Unit',
            'sku' => (string) $v->sku,
            'image_url' => $v->image_url,
            'unit_price' => (float) $v->pivot->price,
            'quantity' => (int) $v->pivot->quantity,
            'line_total' => round((float) $v->pivot->price * (int) $v->pivot->quantity
                + (float) ($v->pivot->extra_piece_price ?? 0) * (int) ($v->pivot->extra_pieces ?? 0), 2),
            'availability' => $availability[$v->id] ?? ['state' => 'unavailable', 'text' => 'Not available'],
        ])->values();

        return [
            'store' => $store?->name,
            'customer' => self::firstName($cart->customer?->name),
            'seller' => self::firstName(trim(($cart->seller?->first_name ?? '').' '.($cart->seller?->last_name ?? ''))),
            'lines' => $lines->all(),
            'total' => $this->shares->total($cart),
            'requires_delay_agreement' => (bool) $grouped['requires_agreement'],
            'expires_at' => $share->expires_at->toIso8601String(),
            'accounts' => PaymentAccount::query()->collectingFor((int) $cart->store_id)->orderBy('provider')->get()
                ->map(fn (PaymentAccount $a) => self::account($a))->values()->all(),
            'addresses' => CustomerAddress::query()->where('customer_id', $cart->customer_id)->orderByDesc('last_used_at')->limit(5)->get()
                ->map(fn (CustomerAddress $a) => ['id' => (int) $a->id, 'label' => $a->label, 'address' => (string) $a->address, 'recipient_name' => $a->recipient_name, 'recipient_phone' => $a->recipient_phone])
                ->values()->all(),
            'recipient' => ['name' => $cart->customer?->name, 'phone' => $cart->customer?->phone],
        ];
    }

    /**
     * The store's catalogue, as this customer would pay for it: up to 24
     * matches, each priced through the cart's own price ladder.
     *
     * @return array<int, array<string, mixed>>
     */
    public function catalogue(CartShare $share, string $term): array
    {
        $cart = $share->cart()->with('customer')->firstOrFail();
        $stock = app(StockService::class);

        return StoreVariant::query()
            ->where('store_id', $cart->store_id)
            ->where('active', true)
            ->whereHas('itemVariant', fn ($q) => $q->where(fn ($w) => $w
                ->where('sku', 'like', "%{$term}%")
                ->orWhereHas('item', fn ($i) => $i->where('product_name', 'like', "%{$term}%"))))
            ->with(['itemVariant.item', 'itemVariant.itemColor', 'itemVariant.itemSize', 'itemVariant.itemPackagingType'])
            ->limit(24)
            ->get()
            ->map(function (StoreVariant $sv) use ($cart, $stock): ?array {
                $v = $sv->itemVariant;

                if ($v === null) {
                    return null;
                }

                try {
                    $price = $this->carts->resolveLinePrice($cart, $v);
                } catch (\RuntimeException) {
                    return null;
                }

                return [
                    'variant_id' => (int) $v->id,
                    'title' => (string) ($v->item?->product_name ?? 'Item'),
                    'detail' => collect([$v->itemColor?->name, $v->itemSize?->name])->filter()->implode(' · ') ?: null,
                    'unit' => $v->itemPackagingType?->name ?? 'Unit',
                    'image_url' => $v->image_url,
                    'unit_price' => $price,
                    'in_stock' => $stock->availableAtStore((int) $v->id, (int) $cart->store_id) > 0,
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /** The order this link became. @return array<string, mixed> */
    public function order(CartShare $share): array
    {
        /** @var Sale $sale */
        $sale = $share->sale()->with(['store', 'delivery', 'payments.account', 'items.storeVariant.itemVariant.item', 'items.storeVariant.itemVariant.itemPackagingType'])->firstOrFail();
        $log = app(CustodyLog::class)->forSale($sale);
        $stage = app(SellerOrderBoard::class)->stageOf($sale);

        // The customer's view of the trail: what happened and when, no places or people.
        $shown = ['order', 'payment', 'pick', 'custody_in', 'deliver', 'delivery'];
        $events = collect($log['events'] ?? [])
            ->filter(fn (array $e) => in_array($e['kind'], $shown, true))
            ->map(fn (array $e) => [
                'at' => $e['at'],
                'title' => match ($e['kind']) {
                    'pick' => 'Being packed',
                    'custody_in' => 'Handed to the courier',
                    default => preg_replace('/^Picked from .*/', 'Being packed', (string) $e['title']),
                },
                'icon' => $e['icon'],
            ])
            ->unique(fn (array $e) => $e['title'].substr((string) $e['at'], 0, 16))
            ->values();

        return [
            'reference' => (string) $sale->reference_number,
            'store' => $sale->store?->name,
            'stage' => $stage,
            'total' => (float) $sale->total_amount,
            'payment_status' => (string) $sale->payment_status,
            'placed_at' => $sale->created_at?->toIso8601String(),
            'delivery' => $sale->delivery === null ? null : [
                'method' => (string) ($sale->delivery->method ?? 'courier'),
                'address' => $sale->delivery->delivery_address,
                'status' => (string) $sale->delivery->status,
            ],
            'lines' => $sale->items->map(fn ($i) => [
                'title' => (string) ($i->storeVariant?->itemVariant?->item?->product_name ?? 'Item'),
                'unit' => $i->storeVariant?->itemVariant?->itemPackagingType?->name,
                'quantity' => (int) $i->quantity,
                'line_total' => (float) $i->total_price,
            ])->values()->all(),
            'payments' => $sale->payments
                ->where('payment_method', '!=', Payment::METHOD_CREDIT)
                ->whereNotIn('status', [Payment::STATUS_VOID])
                ->map(fn (Payment $p) => [
                    'id' => (int) $p->id,
                    'amount' => (float) $p->amount,
                    'status' => (string) $p->status,
                    'reference' => $p->transaction_reference,
                    'account' => $p->account ? self::account($p->account) : null,
                    'can_claim' => $p->status === Payment::STATUS_PENDING && $p->payment_account_id !== null,
                ])->values()->all(),
            'events' => $events->all(),
        ];
    }

    /** @return array<string, mixed> */
    private static function account(PaymentAccount $a): array
    {
        return [
            'id' => (int) $a->id,
            'type' => (string) $a->type,
            'provider' => (string) (config("payments.providers.{$a->provider}.name") ?? $a->provider),
            'account_name' => (string) $a->account_name,
            'account_number' => (string) $a->account_number,
        ];
    }

    private static function firstName(?string $name): ?string
    {
        $name = trim((string) $name);

        return $name === '' ? null : explode(' ', $name)[0];
    }
}
