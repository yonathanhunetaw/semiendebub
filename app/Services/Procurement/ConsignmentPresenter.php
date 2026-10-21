<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Models\Auth\User;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentCost;
use App\Models\Procurement\ConsignmentLine;
use App\Services\Inventory\StockLocationTree;

/** Consignments as the procurement and confirming screens read them. */
class ConsignmentPresenter
{
    public const STAGE_LABELS = [
        Consignment::FORMING => 'Being put together',
        'overseas_warehouse' => 'Overseas warehouse',
        'at_sea' => 'At sea',
        'sea_port' => 'At the sea port',
        'dry_port' => 'At the dry port',
        Consignment::RECEIVED => 'Received',
        Consignment::CANCELLED => 'Cancelled',
    ];

    public function __construct(
        private readonly ConsignmentService $consignments,
        private readonly ConsignmentReceiving $receiving,
    ) {
    }

    /** @return array<string, mixed> */
    public function summary(Consignment $c): array
    {
        $c->loadMissing(['lines', 'costs', 'route']);

        return [
            'id' => (int) $c->id,
            'reference' => (string) $c->reference,
            'stage' => (string) $c->stage,
            'stage_label' => self::STAGE_LABELS[$c->stage] ?? $c->stage,
            'route' => $c->route?->name,
            'container_number' => $c->container_number,
            'eta' => $c->eta?->toDateString(),
            'lines' => $c->lines->count(),
            'units' => (int) $c->lines->sum('quantity'),
            'cbm' => round((float) $c->lines->sum('cbm'), 3),
            'goods_value_etb' => round((float) $c->lines->sum('goods_value_etb'), 2),
            'costs_confirmed_etb' => round((float) $c->costs->filter(fn (ConsignmentCost $x): bool => $x->state() === ConsignmentCost::CONFIRMED)->sum('amount_etb'), 2),
            'costs_pending' => $c->costs->filter(fn (ConsignmentCost $x): bool => $x->state() === ConsignmentCost::PENDING)->count(),
        ];
    }

    /** @return array<string, mixed> */
    public function detail(Consignment $c, ?User $viewer): array
    {
        $c->loadMissing(['lines.variant.item', 'lines.variant.itemColor', 'lines.variant.itemSize', 'lines.variant.itemPackagingType', 'lines.purchaseLine.purchase.supplier', 'costs.recorder', 'costs.confirmer', 'route', 'receivedAt', 'receiver']);
        $openDiscrepancies = \App\Models\Inventory\ReceiptDiscrepancy::query()
            ->where('receivable_type', ConsignmentLine::class)->whereIn('receivable_id', $c->lines->pluck('id'))
            ->where('status', \App\Models\Inventory\ReceiptDiscrepancy::OPEN)->count();
        $allocation = $this->consignments->allocation($c);
        $byLine = collect($allocation['lines'])->keyBy('id');
        $dates = $c->stage_dates ?? [];
        $order = [Consignment::FORMING, ...Consignment::IN_TRANSIT];
        $at = array_search($c->stage, $order, true);

        return $this->summary($c) + [
            'freight_route_id' => $c->freight_route_id !== null ? (int) $c->freight_route_id : null,
            'bill_of_lading' => $c->bill_of_lading,
            'notes' => $c->notes,
            'timeline' => array_map(fn (string $stage, int $i): array => [
                'stage' => $stage,
                'label' => self::STAGE_LABELS[$stage],
                'date' => $dates[$stage] ?? null,
                'state' => $at === false ? 'done' : ($i < $at ? 'done' : ($i === $at ? 'current' : 'ahead')),
            ], $order, array_keys($order)),
            'next_stages' => array_map(fn (string $s): array => ['stage' => $s, 'label' => self::STAGE_LABELS[$s]], $this->consignments->nextStages($c)),
            'lines_detail' => $c->lines->sortBy('id')->values()->map(function (ConsignmentLine $l) use ($byLine): array {
                $purchase = $l->purchaseLine?->purchase;

                return [
                    'id' => (int) $l->id,
                    'variant' => $l->variant ? PurchaseOrderPresenter::variant($l->variant) : null,
                    'purchase' => $purchase ? ['id' => (int) $purchase->id, 'reference' => (string) $purchase->reference_number, 'supplier' => $purchase->supplier?->name] : null,
                    'quantity' => (int) $l->quantity,
                    'cbm' => $l->cbm !== null ? (float) $l->cbm : null,
                    'weight_kg' => $l->weight_kg !== null ? (float) $l->weight_kg : null,
                    'received_quantity' => $l->received_quantity,
                    'damaged_quantity' => $l->damaged_quantity,
                    'receipt_note' => $l->receipt_note,
                    // Written when the costs are finalised: per unit that arrived whole.
                    'final_unit_etb' => $l->landed_unit_etb !== null ? (float) $l->landed_unit_etb : null,
                ] + ($byLine[$l->id] ?? []);
            })->all(),
            'allocation_warnings' => $allocation['warnings'],
            'costs_detail' => $c->costs->sortBy('id')->values()->map(fn (ConsignmentCost $x): array => [
                'id' => (int) $x->id,
                'stage' => (string) $x->stage,
                'stage_label' => self::STAGE_LABELS[$x->stage] ?? $x->stage,
                'kind' => (string) $x->kind,
                'label' => $x->label(),
                'description' => $x->description,
                'currency' => (string) $x->currency,
                'exchange_rate' => (float) $x->exchange_rate,
                'amount' => (float) $x->amount,
                'amount_etb' => (float) $x->amount_etb,
                'allocation' => (string) $x->allocation,
                'recoverable' => (bool) $x->recoverable,
                'reference' => $x->reference,
                'paid_on' => $x->paid_on?->toDateString(),
                'state' => $x->state(),
                'reject_reason' => $x->reject_reason,
                'recorded_by' => self::name($x->recorder),
                'confirmed_by' => self::name($x->confirmer),
                'can_confirm' => $this->consignments->mayConfirm($viewer, $x),
                'can_delete' => $x->state() === ConsignmentCost::PENDING && (int) $x->recorded_by === (int) $viewer?->id,
            ])->all(),
            'comparison' => $this->consignments->comparison($c),
            'can_manage' => $this->consignments->mayManage($viewer) && ! in_array($c->stage, [Consignment::RECEIVED, Consignment::CANCELLED], true),
            // Costs may still be recorded after receiving, until they are finalised.
            'can_record_costs' => $this->consignments->mayManage($viewer) && $c->stage !== Consignment::CANCELLED && $c->costs_finalised_at === null,
            'received' => $c->received_at ? [
                'at' => $c->received_at->toIso8601String(),
                'location' => $c->receivedAt?->name,
                'by' => self::name($c->receiver),
                'open_discrepancies' => $openDiscrepancies,
            ] : null,
            'costs_finalised_at' => $c->costs_finalised_at?->toIso8601String(),
            'finalise_blocker' => $this->receiving->finaliseBlocker($c),
            'can_finalise' => $this->consignments->mayManage($viewer) && $this->receiving->finaliseBlocker($c) === null,
            'stock_location' => $c->isInTransit() ? StockLocationTree::INBOUND_STAGES[$c->stage][1] : null,
        ];
    }

    /** One cost waiting to be confirmed, with what it is for (the inboxes). @return array<string, mixed> */
    public function pendingCost(ConsignmentCost $x, ?User $viewer): array
    {
        $x->loadMissing(['consignment', 'recorder']);

        return [
            'id' => (int) $x->id,
            'consignment' => ['id' => (int) $x->consignment_id, 'reference' => (string) ($x->consignment?->reference ?? '')],
            'label' => $x->label(),
            'stage_label' => self::STAGE_LABELS[$x->stage] ?? $x->stage,
            'description' => $x->description,
            'currency' => (string) $x->currency,
            'amount' => (float) $x->amount,
            'amount_etb' => (float) $x->amount_etb,
            'recoverable' => (bool) $x->recoverable,
            'reference' => $x->reference,
            'paid_on' => $x->paid_on?->toDateString(),
            'recorded_by' => self::name($x->recorder),
            'state' => $x->state(),
            'can_confirm' => $this->consignments->mayConfirm($viewer, $x),
        ];
    }

    private static function name(?User $user): ?string
    {
        return $user ? (trim($user->first_name.' '.$user->last_name) ?: (string) $user->email) : null;
    }
}
