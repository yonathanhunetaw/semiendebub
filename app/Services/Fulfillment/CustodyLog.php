<?php

declare(strict_types=1);

namespace App\Services\Fulfillment;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Inventory\InventoryMovement;
use App\Models\Inventory\StockLocation;
use App\Models\Inventory\StockReservation;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * One order's chain of custody: who held its goods, where, and when.
 *
 * Everything here is read from records, not invented: the sale and its
 * payments, the delivery run, and every inventory_movements row written about
 * its lines — the reservation at checkout, the pick off a shelf, floor or
 * Remote Hub into Delivery's custody, and the hand-off to the customer (or the
 * return). The journal is the audit trail; this only puts it in order.
 */
class CustodyLog
{
    private int $sequence = 0;

    /** Journal verbs, as the custody log speaks them. */
    private const EVENT = [
        'reserve' => ['title' => 'Stock reserved', 'icon' => 'bookmark_added', 'tone' => 'emerald'],
        'release' => ['title' => 'Reservation released', 'icon' => 'bookmark_remove', 'tone' => 'slate'],
        'pick' => ['title' => 'Picked', 'icon' => 'checklist_rtl', 'tone' => 'indigo'],
        'custody_in' => ['title' => 'Handed to Delivery', 'icon' => 'local_shipping', 'tone' => 'amber'],
        'deliver' => ['title' => 'Delivered to the customer', 'icon' => 'two_wheeler', 'tone' => 'brand'],
        'custody_out' => ['title' => 'Back from Delivery', 'icon' => 'undo', 'tone' => 'rose'],
        'return' => ['title' => 'Returned to stock', 'icon' => 'assignment_return', 'tone' => 'rose'],
    ];

    /**
     * @return array<string, mixed>
     */
    public function forSale(Sale $sale): array
    {
        $sale->loadMissing([
            'customer',
            'seller',
            'store',
            'payments.user',
            'delivery.courier',
            'items.storeVariant.itemVariant.item',
            'items.storeVariant.itemVariant.itemPackagingType',
            'items.picker',
        ]);

        $journal = $this->journal($sale);
        $locations = StockLocation::query()
            ->with('store')
            ->whereIn('id', $journal->pluck('stock_location_id')->filter()->unique())
            ->get()
            ->keyBy('id');
        $users = User::query()
            ->whereIn('id', $journal->pluck('user_id')
                ->merge($journal->where('source_type', User::class)->pluck('source_id'))
                ->merge($journal->where('destination_type', User::class)->pluck('destination_id'))
                ->filter()->unique())
            ->get()
            ->keyBy('id');

        $delivery = $sale->delivery;
        $phase = $this->phase($sale);

        return [
            'reference' => (string) $sale->reference_number,
            'customer' => [
                'name' => $sale->customer?->name ?? $delivery?->recipient_name ?? 'Walk-in customer',
                'phone' => $sale->customer?->phone ?? $delivery?->recipient_phone,
            ],
            'store' => $sale->store?->name,
            'seller' => $this->name($sale->seller),
            'total' => (float) $sale->total_amount,
            'payment_status' => (string) $sale->payment_status,
            'stage' => (string) $sale->fulfillment_stage,
            'placed_at' => $sale->created_at?->toIso8601String(),
            'phase' => $phase,
            'delivery' => $delivery === null ? null : [
                'tracking_number' => $delivery->tracking_number,
                'status' => (string) $delivery->status,
                'courier' => $this->name($delivery->courier) ?? $delivery->courier_name,
                'address' => $delivery->delivery_address,
                'failure_reason' => $delivery->failure_reason,
            ],
            'lines' => $sale->items->map(fn (SaleItem $item): array => $this->line($item, $journal, $locations))->values()->all(),
            'events' => $this->events($sale, $journal, $locations, $users),
        ];
    }

    /**
     * Every journal row about this order's lines: rows that reference a line
     * directly (pick, custody, delivery, return) and the reservation rows,
     * which reference the reservation that holds the line.
     *
     * @return Collection<int, InventoryMovement>
     */
    private function journal(Sale $sale): Collection
    {
        $itemIds = $sale->items->pluck('id')->map(fn ($id): string => (string) $id);
        $reservationIds = StockReservation::query()
            ->whereIn('sale_item_id', $sale->items->pluck('id'))
            ->pluck('id')
            ->map(fn ($id): string => (string) $id);

        return InventoryMovement::query()
            ->where(fn ($q) => $q
                ->where(fn ($line) => $line->where('reference_type', (new SaleItem())->getMorphClass())->whereIn('reference_id', $itemIds))
                ->orWhere(fn ($hold) => $hold->where('reference_type', (new StockReservation())->getMorphClass())->whereIn('reference_id', $reservationIds)))
            ->orderBy('created_at')
            ->orderBy('id')
            ->get();
    }

    /**
     * Which of the three phases the order is in: 1 placed, 2 sourcing, 3 with
     * Delivery (or done).
     *
     * @return array{current: int, labels: array<int, string>}
     */
    private function phase(Sale $sale): array
    {
        $current = match (true) {
            $sale->delivery !== null && $sale->sourcing_confirmed_at !== null => 3,
            $sale->fulfillment_stage === Sale::STAGE_PICK_PACK => 2,
            default => 1,
        };

        return ['current' => $current, 'labels' => [1 => 'Order placed', 2 => 'Sourcing', 3 => 'Delivery']];
    }

    /**
     * One line, with the path its goods took: the place they were picked
     * from, Delivery's custody, the customer.
     *
     * @param  Collection<int, InventoryMovement>  $journal
     * @param  Collection<int, StockLocation>  $locations
     * @return array<string, mixed>
     */
    private function line(SaleItem $item, Collection $journal, Collection $locations): array
    {
        $variant = $item->storeVariant?->itemVariant;
        $rows = $journal->filter(fn (InventoryMovement $row): bool => $row->reference_type === $item->getMorphClass()
            && (int) $row->reference_id === (int) $item->id);
        $pick = $rows->firstWhere('type', 'pick');
        $source = $pick !== null ? $locations->get($pick->stock_location_id) : null;

        $status = match (true) {
            $rows->contains('type', 'deliver') => 'delivered',
            $rows->contains('type', 'return') => 'returned',
            $rows->contains('type', 'custody_in') => 'with_delivery',
            $pick !== null => 'picked',
            default => 'reserved',
        };

        return [
            'id' => (int) $item->id,
            'name' => (string) ($variant?->item?->product_name ?? 'Unnamed product'),
            'sku' => $variant?->sku,
            'unit' => $variant?->itemPackagingType?->name,
            'quantity' => (int) $item->quantity,
            'picked_quantity' => (int) $item->picked_quantity,
            'status' => $status,
            'source' => $source === null ? null : $this->place($source),
            'picked_by' => $this->name($item->picker),
        ];
    }

    /**
     * The audit trail, oldest first: the sale's own milestones and every
     * journal row, each with who, where and when.
     *
     * @param  Collection<int, InventoryMovement>  $journal
     * @param  Collection<int, StockLocation>  $locations
     * @param  Collection<int, User>  $users
     * @return array<int, array<string, mixed>>
     */
    private function events(Sale $sale, Collection $journal, Collection $locations, Collection $users): array
    {
        $events = collect();

        $events->push($this->event('order', $sale->created_at, 'Order placed', 'shopping_cart', 'emerald',
            "Order {$sale->reference_number} placed at ".($sale->store?->name ?? 'the store').'.',
            $this->name($sale->seller ?? $sale->user), $sale->store?->name, null));

        foreach ($sale->payments as $payment) {
            $events->push($this->event('payment', $payment->paid_at ?? $payment->created_at, 'Payment received', 'paid', 'emerald',
                number_format((float) $payment->amount, 2).' '.($payment->currency ?? 'ETB').' by '.str_replace('_', ' ', (string) $payment->payment_method).'.',
                $this->name($payment->user), null, $payment->transaction_reference));
        }

        // Several lines picked in one go share a moment; one row per verb and
        // place keeps the trail readable while the lines carry the detail.
        $grouped = $journal->groupBy(fn (InventoryMovement $row): string => $row->type.'|'.$row->stock_location_id.'|'.$row->created_at?->format('Y-m-d H:i:s'));

        foreach ($grouped as $rows) {
            /** @var InventoryMovement $first */
            $first = $rows->first();
            $meta = self::EVENT[$first->type] ?? ['title' => ucfirst(str_replace('_', ' ', (string) $first->type)), 'icon' => 'swap_horiz', 'tone' => 'slate'];
            $place = $locations->get($first->stock_location_id);
            $courierId = $first->destination_type === User::class ? $first->destination_id
                : ($first->source_type === User::class ? $first->source_id : null);
            $units = (int) $rows->sum(fn (InventoryMovement $row): int => abs((int) $row->quantity));

            $title = $first->type === 'pick' && $place !== null ? "Picked from {$place->name}" : $meta['title'];

            $events->push($this->event(
                $first->type,
                $first->created_at,
                $title,
                $meta['icon'],
                $meta['tone'],
                trim(sprintf('%d unit%s%s', $units, $units === 1 ? '' : 's', $first->reason ? ' · '.$first->reason : '')),
                $this->name($users->get($first->user_id)),
                $place === null ? null : $this->place($place)['label'],
                $courierId !== null ? 'Courier: '.($this->name($users->get($courierId)) ?? '#'.$courierId) : null,
            ));
        }

        $delivery = $sale->delivery;

        if ($delivery !== null) {
            $courier = $this->name($delivery->courier) ?? $delivery->courier_name;

            foreach ([
                'picked_up_at' => ['Collected by the courier', 'inventory', 'amber'],
                'shipped_at' => ['On the road', 'local_shipping', 'amber'],
                'failed_at' => ['Delivery attempt failed', 'error', 'rose'],
            ] as $column => [$title, $icon, $tone]) {
                if ($delivery->{$column} !== null) {
                    $events->push($this->event('delivery', $delivery->{$column}, $title, $icon, $tone,
                        $column === 'failed_at' && $delivery->failure_reason ? $delivery->failure_reason : ($delivery->delivery_address ?? ''),
                        $courier, null, $delivery->tracking_number));
                }
            }
        }

        return $events
            ->sortBy(fn (array $event): string => ($event['at'] ?? '').'|'.$event['order'])
            ->values()
            ->map(function (array $event, int $index): array {
                unset($event['order']);

                return $event + ['step' => $index + 1];
            })
            ->all();
    }

    /** @return array<string, mixed> */
    private function event(string $kind, ?Carbon $at, string $title, string $icon, string $tone, string $detail, ?string $who, ?string $where, ?string $token): array
    {
        return [
            'kind' => $kind,
            'at' => $at?->toIso8601String(),
            'title' => $title,
            'icon' => $icon,
            'tone' => $tone,
            'detail' => $detail,
            'who' => $who,
            'where' => $where,
            'token' => $token,
            // Ties on the same second keep the order they were recorded in.
            'order' => str_pad((string) ++$this->sequence, 6, '0', STR_PAD_LEFT),
        ];
    }

    /** @return array{id: int, name: string, kind: string, label: string} */
    private function place(StockLocation $location): array
    {
        $label = match ($location->kind) {
            StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM => ($location->store?->name ?? '').' · '.$location->name,
            StockLocation::KIND_TRANSIT => 'In Delivery',
            default => $location->name,
        };

        return [
            'id' => (int) $location->id,
            'name' => $location->name,
            'kind' => $location->kind,
            'label' => trim($label, ' ·'),
        ];
    }

    private function name(?User $user): ?string
    {
        if ($user === null) {
            return null;
        }

        return trim($user->first_name.' '.$user->last_name) ?: $user->email;
    }
}
