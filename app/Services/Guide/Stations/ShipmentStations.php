<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Fulfillment\Shipment;
use App\Services\ShipmentWorkflowService;

/**
 * The Shipments desk: the stage before the hand-off (freight, store to hub or
 * hub to store). A shipment is scheduled only once every party has accepted
 * the same time slot, and a dispatched load waits for a courier to claim it.
 * Agreeing is the same route on every app (`{app}.shipments.agree`, the
 * admin's under inventory); the party is worked out from who the viewer is.
 */
class ShipmentStations
{
    use BuildsStations;

    public function __construct(private readonly ShipmentWorkflowService $workflow)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        if (! in_array($app, ['stock_keeper', 'seller', 'delivery', 'admin'], true)) {
            return [];
        }

        $agree = $app === 'admin' ? 'admin.inventory.shipments.agree' : "{$app}.shipments.agree";

        $rows = Shipment::query()->forStore($storeId)
            ->whereIn('status', [ShipmentWorkflowService::DRAFT, ShipmentWorkflowService::PENDING_AGREEMENT, ShipmentWorkflowService::DISPATCHED])
            ->with(['originLocation', 'destinationLocation'])->latest('id')->limit(10)->get();

        $items = $rows->map(function (Shipment $s) use ($viewer, $app, $agree): array {
            $actions = [];
            $lines = [];

            if (in_array($s->status, [ShipmentWorkflowService::DRAFT, ShipmentWorkflowService::PENDING_AGREEMENT], true)) {
                $slots = $this->workflow->scheduleOptions($s);
                $outstanding = $this->workflow->outstandingParties($s);
                $mine = $this->workflow->partiesFor($s, $viewer);
                $lines[] = $outstanding === [] ? 'Every party agreed.' : 'Still to agree: '.implode(', ', $outstanding).'.';

                if ($slots !== [] && array_intersect($mine, $outstanding) !== []) {
                    $field = ['name' => 'slot', 'label' => 'Time slot', 'type' => 'select', 'required' => true, 'default' => $slots[0],
                        'options' => array_map(fn (string $slot): array => ['value' => $slot, 'label' => str_replace('T', ' ', $slot)], $slots)];
                    $actions[] = $this->act('agree', 'Agree to this slot', $agree, ['shipment' => $s->id], 'post', ['stance' => ShipmentWorkflowService::AGREEMENT_ACCEPTED], [$field], 'success');
                }
            }

            if ($app === 'delivery' && $s->status === ShipmentWorkflowService::DISPATCHED && $s->courier_id === null) {
                $actions[] = $this->act('claim', 'Take this run', 'delivery.shipments.claim', ['shipment' => $s->id], 'post', [], [], 'primary');
            }

            return [
                'id' => (string) $s->id,
                'title' => $s->reference.' · '.($s->originLocation?->name ?? '?').' → '.($s->destinationLocation?->name ?? '?'),
                'subtitle' => ($s->vehicle_name ?: 'No vehicle yet').($s->scheduled_for ? ' · '.str_replace('T', ' ', $s->scheduled_for->format('Y-m-d\TH:i')) : ''),
                'lines' => $lines,
                'chips' => [['label' => (string) $s->status, 'tone' => 'info']],
                'actions' => array_values(array_filter($actions)),
            ];
        })->all();

        return [$this->station('shipments', 'Shipments', 'desk_shipments', $items, [
            'blurb' => 'Freight between the hubs and the shop: every party agrees a slot, then the hand-off runs it.',
            'empty' => 'No shipment is waiting on an agreement or a courier.',
            'open' => $this->open('Open Shipments', $app === 'admin' ? 'admin.inventory.shipments.index' : "{$app}.shipments.index"),
        ])];
    }
}
