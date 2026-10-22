<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Fulfillment\Delivery;
use App\Services\DeliveryService;

/**
 * The Delivery desk, at the loading bay: customer orders that leave the shop
 * with a courier. A courier takes a run from the pool, collects it, drives
 * it and hands it over (or reports why it failed); an admin puts a courier
 * on an unassigned run.
 */
class DeliveryStations
{
    use BuildsStations;

    public function __construct(private readonly DeliveryService $deliveries)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        return match ($app) {
            'delivery' => [$this->courier($viewer)],
            'admin' => [$this->admin($storeId)],
            default => [],
        };
    }

    private function courier(User $viewer): array
    {
        $mine = $this->deliveries->paginateForCourier($viewer, 'open', null, 10)->items();
        $pool = $this->deliveries->paginateUnassigned(null, 10)->items();

        $label = [
            DeliveryService::STATUS_DISPATCHED => 'Collected it',
            DeliveryService::STATUS_IN_TRANSIT => 'On the road',
            DeliveryService::STATUS_DELIVERED => 'Delivered it',
            DeliveryService::STATUS_FAILED => 'Could not deliver',
            DeliveryService::STATUS_RETURNED => 'Returned to the depot',
        ];

        $items = [];

        foreach ($mine as $delivery) {
            /** @var Delivery $delivery */
            $actions = [];

            foreach ($this->deliveries->allowedTransitions($delivery) as $to) {
                $actions[] = $this->act($to, $label[$to] ?? $to, 'delivery.delivery.transition', ['delivery' => $delivery->id], 'patch', ['status' => $to],
                    $to === DeliveryService::STATUS_FAILED ? [['name' => 'failure_reason', 'label' => 'Why', 'type' => 'text', 'required' => true]] : [],
                    $to === DeliveryService::STATUS_DELIVERED ? 'success' : ($to === DeliveryService::STATUS_FAILED || $to === DeliveryService::STATUS_RETURNED ? 'inherit' : 'primary'));
            }

            $items[] = $this->item($delivery, array_values(array_filter($actions)), 'Yours');
        }

        foreach ($pool as $delivery) {
            $items[] = $this->item($delivery, array_values(array_filter([
                $this->act('claim', 'Take this run', 'delivery.delivery.claim', ['delivery' => $delivery->id], 'post', [], [], 'primary'),
            ])), 'On offer');
        }

        return $this->station('delivery', 'Delivery runs', 'desk_bay', $items, [
            'blurb' => 'Customer orders leaving the shop: take a run from the pool, collect it, deliver it or say why not.',
            'empty' => 'No run is waiting for you.',
            'open' => $this->open('Open Delivery', 'delivery.delivery.index'),
        ]);
    }

    private function admin(int $storeId): array
    {
        $couriers = User::query()->where('role', 'delivery')->orderBy('first_name')->get();

        $runs = Delivery::query()->open()
            ->whereHas('sale', fn ($sale) => $sale->where('store_id', $storeId))
            ->with(['sale', 'courier'])->latest('id')->limit(10)->get();

        $items = $runs->map(function (Delivery $d) use ($couriers): array {
            $assign = $d->courier_id === null && $d->status === DeliveryService::STATUS_PENDING && $couriers->isNotEmpty()
                ? $this->act('assign', 'Put a courier on it', 'admin.deliveries.assign', ['delivery' => $d->id], 'patch', [], [
                    ['name' => 'courier_id', 'label' => 'Courier', 'type' => 'select', 'required' => true, 'default' => (string) $couriers->first()->id,
                        'options' => $couriers->map(fn (User $c): array => ['value' => (string) $c->id, 'label' => $this->person($c)])->all()],
                ], 'primary')
                : null;

            return $this->item($d, array_values(array_filter([$assign])), $d->courier ? 'With '.$this->person($d->courier) : 'No courier yet');
        })->all();

        return $this->station('delivery', 'Delivery runs', 'desk_bay', $items, [
            'blurb' => "The shop's open customer deliveries. Put a courier on a run nobody has taken.",
            'empty' => 'No delivery is open.',
            'open' => $this->open('Open Delivery', 'admin.deliveries.index'),
        ]);
    }

    /** @param  array<int, array<string, mixed>>  $actions */
    private function item(Delivery $delivery, array $actions, string $chip): array
    {
        return [
            'id' => (string) $delivery->id,
            'title' => ($delivery->tracking_number ?: 'Run '.$delivery->id).' · '.($delivery->recipient_name ?: 'Customer'),
            'subtitle' => (string) ($delivery->delivery_address ?: 'Collected in store'),
            'lines' => array_values(array_filter([$delivery->sale?->reference_number ? 'Order '.$delivery->sale->reference_number : null, $delivery->failure_reason ? 'Failed: '.$delivery->failure_reason : null])),
            'chips' => [['label' => $chip, 'tone' => 'info'], ['label' => (string) $delivery->status, 'tone' => $delivery->status === DeliveryService::STATUS_FAILED ? 'error' : 'default']],
            'actions' => $actions,
        ];
    }
}
