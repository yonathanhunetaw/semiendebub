<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Fulfillment\Shipment;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\Warehouse;
use App\Models\Item\Item;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\StockKeeper\Transfer;
use App\Services\DeliveryService;
use App\Services\Fulfillment\SellerOrderBoard;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Every part of the admin app as one dashboard card: a headline figure, the
 * few facts that explain it, how many things need someone's attention, and a
 * link to the list (and to each filtered part of it).
 *
 * Store-zone areas follow the active store; the network areas (warehouses,
 * fleet, catalogue, people) are only built for a global admin.
 */
final class DashboardAreas
{
    public function __construct(
        private readonly ActiveStore $activeStore,
        private readonly SellerOrderBoard $board,
    ) {
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function all(): array
    {
        $store = $this->activeStore;
        $since = now()->subDays(6)->startOfDay();
        $today = now()->startOfDay();
        $scopeIds = $store->scopeIds();

        $board = $this->board->counts($store->id());
        $sales = fn (): Builder => $store->apply(Sale::query());
        $deliveries = fn (): Builder => $store->applyThrough(Delivery::query(), 'sale');
        $payments = fn (): Builder => $scopeIds === null ? Payment::query() : Payment::query()->where(fn ($q) => $q
            ->where(fn ($sale) => $store->applyThrough($sale->whereNotNull('sale_id'), 'sale'))
            ->orWhere(fn ($repayment) => $store->applyThrough($repayment->whereNull('sale_id'), 'customer')));
        $transfers = fn (): Builder => Transfer::query()->when($scopeIds !== null, fn ($q) => $q->where(fn ($ends) => $ends
            ->whereIn('from_store_id', $scopeIds ?: [0])->orWhereIn('to_store_id', $scopeIds ?: [0])));
        $shipments = fn (): Builder => Shipment::query()->when($scopeIds !== null, fn ($q) => $q->where(fn ($ends) => $ends
            ->whereIn('origin_store_id', $scopeIds ?: [0])->orWhereIn('destination_store_id', $scopeIds ?: [0])));

        $orders = fn (string $stage): string => route('admin.orders.index', ['stage' => $stage]);

        $areas = [
            // ── Selling ──
            $this->area('customers', 'selling', 'Customers', 'store', route('admin.customers.index'),
                $store->apply(Customer::query())->count(), 'customers', 0, null, [
                    ['New this week', $store->apply(Customer::query())->where('created_at', '>=', $since)->count(), null],
                    ['With credit', $store->apply(Customer::query())->where('credit_limit', '>', 0)->count(), route('admin.credit.index')],
                    ['Special prices', null, route('admin.customers.discounts')],
                ]),
            $this->area('carts', 'selling', 'Carts', 'cart', route('admin.carts.index'),
                $store->apply(Cart::query())->where('status', 'open')->count(), 'open carts', 0, null, [
                    ['Opened today', $store->apply(Cart::query())->where('created_at', '>=', $today)->count(), null],
                ]),
            $this->area('orders', 'selling', 'Orders', 'paid', route('admin.orders.index'),
                $sales()->whereNotIn('fulfillment_stage', [Sale::STAGE_DELIVERED, Sale::STAGE_CANCELLED])->count(), 'in progress',
                (int) ($board['to_pay'] ?? 0), 'waiting for payment', [
                    ['To pay', (int) ($board['to_pay'] ?? 0), $orders('to_pay')],
                    ['To deliver', (int) ($board['to_deliver'] ?? 0), $orders('to_deliver')],
                    ['Delivered · 7d', $sales()->where('fulfillment_stage', Sale::STAGE_DELIVERED)->where('updated_at', '>=', $since)->count(), $orders('delivered')],
                ]),
            $this->area('payments', 'selling', 'Payments', 'pay', route('admin.payments.index'),
                round((float) $payments()->confirmed()->where('paid_at', '>=', $today)->where('payment_method', '!=', Payment::METHOD_CREDIT)->sum('amount'), 2), 'taken today',
                $payments()->where('status', Payment::STATUS_CLAIMED)->count(), 'waiting for the owner to confirm', [
                    ['Cash today', round((float) $payments()->confirmed()->where('paid_at', '>=', $today)->where('payment_method', Payment::METHOD_CASH)->sum('amount'), 2), null, 'money'],
                    ['Accounts', $store->apply(PaymentAccount::query())->where('is_active', true)->count(), route('admin.payment-accounts.index')],
                    ['On credit', $payments()->where('payment_method', Payment::METHOD_CREDIT)->count(), route('admin.credit.index')],
                ], 'money'),
            $this->area('balances', 'selling', 'Seller balances', 'pay', route('admin.balances.index'),
                $store->applyThrough(\App\Models\Finance\BalanceEntry::query(), 'user')->distinct()->count('user_id'), 'sellers holding money',
                $store->applyThrough(Remittance::query(), 'user')->where('status', Remittance::STATUS_CLAIMED)->count(), 'handovers waiting', [
                    ['Confirmed · 7d', $store->applyThrough(Remittance::query(), 'user')->where('status', Remittance::STATUS_CONFIRMED)->where('updated_at', '>=', $since)->count(), null],
                ]),

            // ── Fulfilment ──
            $this->area('pick_pack', 'fulfilment', 'Pick & pack', 'parcel', $orders('paid'),
                (int) ($board['paid'] ?? 0) + (int) ($board['packing'] ?? 0), 'orders to pack',
                (int) ($board['paid'] ?? 0), 'paid, not picked yet', [
                    ['Not started', (int) ($board['paid'] ?? 0), $orders('paid')],
                    ['Being packed', (int) ($board['packing'] ?? 0), $orders('paid')],
                ]),
            $this->area('delivery', 'fulfilment', 'Delivery', 'truck', route('admin.deliveries.index'),
                $deliveries()->open()->count(), 'on the road or waiting',
                $deliveries()->unassigned()->readyToCollect()->where('status', DeliveryService::STATUS_PENDING)->count()
                    + $deliveries()->where('status', DeliveryService::STATUS_FAILED)->count(), 'need a courier or failed', [
                    ['No courier', $deliveries()->unassigned()->readyToCollect()->where('status', DeliveryService::STATUS_PENDING)->count(), route('admin.deliveries.index', ['status' => 'unassigned'])],
                    ['Failed', $deliveries()->where('status', DeliveryService::STATUS_FAILED)->count(), route('admin.deliveries.index', ['status' => 'failed'])],
                    ['Delivered · 7d', $deliveries()->where('status', DeliveryService::STATUS_DELIVERED)->where('delivered_at', '>=', $since)->count(), route('admin.deliveries.index', ['status' => 'delivered'])],
                ]),

            // ── Stock ──
            $this->area('store', 'stock', $store->id() === null ? 'Stock' : 'Store', 'shelf',
                $store->id() === null ? route('inventory.index') : route('store.show', $store->id()),
                $this->unitsOnHand($scopeIds), 'units on hand', 0, null, [
                    ['Out of stock', null, $store->id() === null ? null : route('store.show', ['store' => $store->id(), 'filter' => 'out'])],
                    ['Below min', null, $store->id() === null ? null : route('store.show', ['store' => $store->id(), 'filter' => 'low'])],
                    ['Locations', null, route('admin.inventory.stock-locations.index')],
                ]),
            $this->area('transfers', 'stock', 'Transfers', 'shelf', route('admin.inventory.transfers'),
                $transfers()->active()->whereIn('status', ['pending', 'in_transit'])->count(), 'moving now',
                $store->apply(Transfer::query()->awaitingApproval(), 'to_store_id')->count(), 'waiting for approval', [
                    ['Pending', $transfers()->active()->where('status', 'pending')->count(), route('admin.inventory.transfers')],
                    ['In transit', $transfers()->active()->where('status', 'in_transit')->count(), route('admin.inventory.transfers')],
                    ['To approve', $store->apply(Transfer::query()->awaitingApproval(), 'to_store_id')->count(), route('admin.inventory.replenishment.index')],
                ]),
            $this->area('shipments', 'stock', 'Shipments', 'warehouse', route('admin.inventory.shipments.index'),
                $shipments()->open()->count(), 'open runs',
                $shipments()->whereNotNull('eta')->where('eta', '<', now())->whereNotIn('status', ['received', 'cancelled', 'delivered'])->count(), 'past their ETA', [
                    ['Agreeing a time', $shipments()->where('status', 'pending_agreement')->count(), route('admin.inventory.shipments.index', ['status' => 'pending_agreement'])],
                    ['On the road', $shipments()->whereIn('status', ['dispatched', 'in_transit'])->count(), route('admin.inventory.shipments.index', ['status' => 'in_transit'])],
                    ['Capacity rules', null, route('admin.inventory.capacity.index')],
                ]),
        ];

        if ($store->isGlobal()) {
            $hubIds = StockLocation::query()->ofKind(StockLocation::KIND_MAIN_HUB)->pluck('id');
            $signedIn = DB::table('sessions')->whereNotNull('user_id')
                ->where('last_activity', '>', now()->timestamp - (config('session.lifetime') * 60))
                ->distinct()->count('user_id');

            array_push($areas,
                $this->area('warehouses', 'network', 'Warehouses', 'hub', route('admin.inventory.warehouse.index'),
                    (int) ItemStock::query()->whereIn('stock_location_id', $hubIds->all() ?: [0])->sum('quantity'), 'units in the hubs', 0, null, [
                        ['Main hubs', Warehouse::query()->count(), route('admin.inventory.warehouse.index')],
                        ['Stores', \App\Models\Store\Store::query()->count(), route('admin.inventory.stores')],
                    ]),
                $this->area('fleet', 'network', 'Fleet', 'truck', route('admin.inventory.fleet.index'),
                    Vehicle::query()->count(), 'vehicles', 0, null, [
                        ['Active', Vehicle::query()->where('status', 'active')->count(), route('admin.inventory.fleet.index')],
                        ['Couriers', User::role('delivery')->count(), null],
                    ]),
                $this->area('catalogue', 'network', 'Items', 'parcel', route('admin.items.index'),
                    Item::query()->count(), 'items in the catalogue', 0, null, [
                        ['Active', Item::query()->where('status', 'active')->count(), route('admin.items.index')],
                    ]),
                $this->area('people', 'network', 'People', 'home', route('admin.users.index'),
                    User::query()->count(), 'staff accounts', 0, null, [
                        ['Signed in now', $signedIn, route('admin.sessions.index')],
                        ['Admins', User::role('admin')->count(), route('admin.users.index')],
                    ]),
            );
        }

        return $areas;
    }

    /**
     * @param  array<int, array{0: string, 1: int|float|null, 2: string|null, 3?: string}>  $facts
     * @return array<string, mixed>
     */
    private function area(string $key, string $group, string $label, string $scene, string $href, int|float $value, string $valueLabel, int $attention, ?string $attentionLabel, array $facts, string $format = 'count'): array
    {
        return [
            'key' => $key,
            'group' => $group,
            'label' => $label,
            'scene' => $scene,
            'href' => $href,
            'value' => $value,
            'value_label' => $valueLabel,
            'format' => $format,
            'attention' => $attention,
            'attention_label' => $attentionLabel,
            'facts' => array_map(fn (array $fact): array => [
                'label' => $fact[0],
                'value' => $fact[1],
                'href' => $fact[2],
                'format' => $fact[3] ?? 'count',
            ], $facts),
        ];
    }

    /** Units on store shelves and floors (and a remote hub) in scope. */
    private function unitsOnHand(?array $scopeIds): int
    {
        return (int) ItemStock::query()
            ->whereIn('stock_location_id', StockLocation::query()
                ->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB])
                ->when($scopeIds !== null, fn ($q) => $q->whereIn('store_id', $scopeIds ?: [0]))
                ->select('id'))
            ->sum('quantity');
    }
}
