<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Finance\Sale;
use App\Services\Fulfillment\OrderSourcingService;

/**
 * The Orders desk: paid orders waiting in Pick & Pack (stock keeper and
 * seller apps; both have the same four routes). The order is worked in the
 * same steps the Pick & Pack page takes: start picking, tick each line once
 * it is in hand, mark it packed, then hand it to Delivery (or to the customer
 * in store), sourcing every line from the nearest place that covers it.
 */
class OrderStations
{
    use BuildsStations;

    public function __construct(private readonly OrderSourcingService $sourcing)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        if (! in_array($app, ['stock_keeper', 'seller'], true)) {
            return [];
        }

        $prefix = $app === 'seller' ? 'seller.orders' : 'stock_keeper.orders';
        $mine = $viewer->store_id !== null ? (int) $viewer->store_id : $storeId;

        $sales = Sale::query()->forStore($mine)->awaitingSourcing()->oldest('id')->limit(10)->get();

        $items = $sales->map(function (Sale $sale) use ($prefix, $app): array {
            $plan = $this->sourcing->pickPackPlan($sale);
            $lines = $plan['lines'];
            $started = $plan['sale']['picking_started_at'] !== null;
            $allTicked = $lines !== [] && collect($lines)->every(fn (array $l): bool => $l['ticked_at'] !== null);
            $packed = $plan['sale']['packed_at'] !== null;
            $decisions = collect($lines)->map(fn (array $l): ?array => $l['suggested_source'] === null ? null : [
                'sale_item_id' => $l['id'],
                'location_type' => $l['suggested_source']['location_type'],
                'location_id' => $l['suggested_source']['location_id'],
            ]);
            $covered = $decisions->every(fn ($d): bool => $d !== null);
            $store = ($plan['delivery']['method'] ?? '') === 'store';

            $actions = [];

            if (! $started) {
                $actions[] = $this->act('start', 'Start picking', "{$prefix}.picking.start", ['sale' => $sale->id], 'post', [], [], 'primary');
            }

            foreach ($lines as $line) {
                if ($line['ticked_at'] === null) {
                    $actions[] = $this->act('tick-'.$line['id'], 'In hand: '.$line['title'].' × '.$line['quantity'], "{$prefix}.lines.tick", ['sale' => $sale->id, 'item' => $line['id']], 'post', ['done' => true], [], 'inherit');
                }
            }

            if ($allTicked && ! $packed) {
                $actions[] = $this->act('packed', 'Packed & labelled', "{$prefix}.packed", ['sale' => $sale->id], 'post', ['done' => true], [], 'success');
            }

            if ($packed && $covered) {
                $route = $app === 'seller' ? 'seller.orders.sourcing.confirm' : 'stock_keeper.orders.pick';
                $actions[] = $this->act('confirm', $store ? 'Hand to the customer' : 'Hand to Delivery', $route, ['sale' => $sale->id], 'post', [
                    'lines' => $decisions->filter()->values()->all(),
                ], [], 'success', 'Take every line from the nearest place that covers it?');
            }

            return [
                'id' => (string) $sale->id,
                'title' => (string) $plan['sale']['reference'].' · '.($plan['sale']['customer'] ?? 'Walk-in customer'),
                'subtitle' => $store ? 'Collected in store' : 'For delivery'.($plan['delivery']['address'] ?? null ? ' · '.$plan['delivery']['address'] : ''),
                'lines' => collect($lines)->map(fn (array $l): string => ($l['ticked_at'] !== null ? '✓ ' : '').$l['title'].' × '.$l['quantity'])->all(),
                'chips' => array_values(array_filter([
                    ['label' => $packed ? 'Packed' : ($started ? 'Picking' : 'Not started'), 'tone' => $packed ? 'success' : 'info'],
                    $packed && ! $covered ? ['label' => 'Short of stock', 'tone' => 'error'] : null,
                    ['label' => $plan['sale']['paid'] ? 'Paid' : 'Payment pending', 'tone' => $plan['sale']['paid'] ? 'success' : 'warning'],
                ])),
                'actions' => array_values(array_filter($actions)),
            ];
        })->all();

        return [$this->station('orders', 'Orders to pick', 'desk_orders', $items, [
            'blurb' => 'Paid orders waiting in Pick & Pack: start picking, tick each line once it is in hand, pack, then hand it on.',
            'empty' => 'No order is waiting to be picked.',
            'open' => $this->open('Open Orders', $app === 'seller' ? 'seller.orders.index' : 'stock_keeper.orders.index'),
        ])];
    }
}
