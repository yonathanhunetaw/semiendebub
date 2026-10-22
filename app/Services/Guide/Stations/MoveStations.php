<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Inventory\StockLocation;
use App\Models\StockKeeper\ItemStock;

/**
 * The Transfers desk: raise a transfer between the Main Store's places (the
 * Remote Hub to the floor, the floor to the shelf). The people who carry it
 * on are the transfer relay (legs) and the shelving job. Stock keeper app.
 */
class MoveStations
{
    use BuildsStations;

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        return array_values(array_filter([
            $app === 'stock_keeper' ? $this->transfers($viewer, $storeId) : null,
            $this->refills($viewer, $shelving),
            $app === 'admin' ? $this->proposals($viewer, $storeId) : null,
        ]));
    }

    /** Shelf bins at or below their refill line with nothing on its way: ask for a refill (the route decides where from). */
    private function refills(User $viewer, array $shelving): ?array
    {
        $route = ['stock_keeper' => 'stock_keeper.shelves.refill', 'seller' => 'seller.locations.bands.refill'][$this->app] ?? null;

        if ($route === null || ! ($shelving['can_raise'] ?? false) || empty($shelving['shelf'])) {
            return null;
        }

        $items = array_map(fn (array $need): array => [
            'id' => 'need-'.$need['item_id'],
            'title' => (string) $need['name'],
            'subtitle' => (string) ($need['display'] ?? ''),
            'chips' => [['label' => (string) $need['status'], 'tone' => 'warning']],
            'actions' => array_values(array_filter([
                $this->act('refill', 'Ask for a refill', $route, ['location' => $shelving['shelf']['id'], 'item' => $need['item_id']], 'post', [], [], 'primary'),
            ])),
        ], array_slice($shelving['needs'] ?? [], 0, 12));

        return $this->station('refills', 'Shelf refills', 'desk_moves', $items, [
            'blurb' => 'Bins on the shelf at or below their refill line, with nothing on the way. Ask for a refill: the store decides where it comes from.',
            'empty' => 'No bin is waiting for stock.',
        ]);
    }

    /** Automated replenishment proposals a store manager or admin rules on (admin app). */
    private function proposals(User $viewer, int $storeId): ?array
    {
        $rows = \App\Models\StockKeeper\Transfer::query()
            ->where('approval_state', \App\Models\StockKeeper\Transfer::APPROVAL_PENDING)->where('status', 'pending')
            ->where(fn ($q) => $q->where('from_store_id', $storeId)->orWhere('to_store_id', $storeId))
            ->with(['itemVariant.item'])->orderBy('id')->limit(10)->get();

        $items = $rows->map(fn (\App\Models\StockKeeper\Transfer $t): array => [
            'id' => 'proposal-'.$t->id,
            'title' => ($t->itemVariant?->item?->product_name ?? 'Item').' × '.(int) $t->quantity,
            'subtitle' => $t->reference.' · proposed by the capacity planner',
            'chips' => [['label' => 'Awaits approval', 'tone' => 'warning']],
            'actions' => $viewer->can('approve', $t) ? array_values(array_filter([
                $this->act('approve', 'Approve', 'admin.inventory.replenishment.approve', ['transfer' => $t->id], 'post', [], [
                    ['name' => 'quantity', 'label' => 'How many (leave empty for the proposal)', 'type' => 'number', 'min' => 1],
                ], 'success'),
                $this->act('reject', 'Reject', 'admin.inventory.replenishment.reject', ['transfer' => $t->id], 'post', [], [
                    ['name' => 'reason', 'label' => 'Why', 'type' => 'text', 'required' => true],
                ], 'inherit'),
            ])) : [],
        ])->all();

        return $this->station('proposals', 'Replenishment proposals', 'desk_moves', $items, [
            'blurb' => 'Transfers the capacity planner proposed. They cannot move until a store manager or admin approves.',
            'empty' => 'No proposal is waiting.',
            'open' => $this->open('Open Replenishment', 'admin.inventory.replenishment.index'),
        ]);
    }

    private function transfers(User $viewer, int $storeId): array
    {
        $places = StockLocation::query()->where('store_id', $storeId)
            ->whereIn('kind', [StockLocation::KIND_SHELF, StockLocation::KIND_BACKROOM, StockLocation::KIND_REMOTE_HUB])->get()->keyBy('kind');

        $routes = [
            ['from' => StockLocation::KIND_REMOTE_HUB, 'to' => StockLocation::KIND_BACKROOM, 'title' => 'Remote Hub → Store Floor', 'subtitle' => 'Leaves the site, so a courier carries it.'],
            ['from' => StockLocation::KIND_BACKROOM, 'to' => StockLocation::KIND_SHELF, 'title' => 'Store Floor → Store Shelf', 'subtitle' => 'Staff carry it across: it lands on the shelving list.'],
        ];

        $items = [];

        foreach ($routes as $route) {
            $from = $places->get($route['from']);
            $to = $places->get($route['to']);

            if ($from === null || $to === null || ! $from->canBeOperatedBy($viewer)) {
                continue;
            }

            $stock = ItemStock::query()->where('stock_location_id', $from->id)->where('quantity', '>', 0)
                ->with('itemVariant.item')->orderByDesc('quantity')->limit(25)->get()->filter(fn (ItemStock $s): bool => $s->itemVariant !== null);

            if ($stock->isEmpty()) {
                continue;
            }

            $action = $this->act('raise', 'Raise the transfer', 'stock_keeper.transfers.store', [], 'post', [
                'source_location_type' => StockLocation::class, 'source_location_id' => $from->id,
                'destination_location_type' => StockLocation::class, 'destination_location_id' => $to->id,
            ], [
                ['name' => 'item_variant_id', 'label' => 'What', 'type' => 'select', 'required' => true, 'default' => (string) $stock->first()->item_variant_id,
                    'options' => $stock->map(fn (ItemStock $s): array => ['value' => (string) $s->item_variant_id, 'label' => ($s->itemVariant->item?->product_name ?? 'Item').' · '.($s->itemVariant->sku ?? '').' ('.(int) $s->quantity.' there)'])->values()->all()],
                ['name' => 'quantity', 'label' => 'How many', 'type' => 'number', 'default' => 1, 'min' => 1, 'required' => true],
            ], 'primary');

            if ($action !== null) {
                $items[] = ['id' => $route['from'].'-'.$route['to'], 'title' => $route['title'], 'subtitle' => $route['subtitle'], 'actions' => [$action]];
            }
        }

        return $this->station('moves', 'Move stock', 'desk_moves', $items, [
            'blurb' => 'Raise a transfer from what is on the shelf of the origin. It then goes on by the relay or the shelving list.',
            'empty' => 'Nothing to move: the places you work have no stock.',
            'open' => $this->open('Open Transfers', 'stock_keeper.transfers.index'),
        ]);
    }
}
