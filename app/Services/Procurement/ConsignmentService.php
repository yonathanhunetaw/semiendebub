<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\ProductIdeaException;
use App\Models\Auth\User;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentCost;
use App\Models\Procurement\ConsignmentLine;
use App\Models\Procurement\ExchangeRate;
use App\Models\Procurement\FreightRoute;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\PurchaseLine;
use App\Models\Procurement\Tariff;
use App\Services\Inventory\StockLocationTree;
use App\Services\Inventory\StockPermissions;
use App\Services\StockService;
use App\Services\Workforce\LocalTime;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Consignments (docs/plans/procurement-pipeline.md, PP4): goods we bought on
 * their way in, from the supplier to the dry port.
 *
 * While forming, procurement puts ordered purchase order lines on it (all of
 * a line or part of it; never more than is left). Moving it to its first
 * stage books the goods into the ledger at that stage's location (we own
 * them from there); every later stage moves them on, through StockService.
 * Stages only go forward, and may skip one (a supplier who ships straight
 * from the factory). Receiving at the Main Hub is PP5.
 *
 * Every cost paid on the way is a line one person records and someone else,
 * finance or a global admin, confirms; only confirmed costs count. Each is
 * spread over the lines by CBM, value or weight, to the cent, and VAT and
 * withholding stay out of the goods' cost (they are claimed back).
 */
class ConsignmentService
{
    public function __construct(
        private readonly StockPermissions $permissions,
        private readonly StockService $stock,
        private readonly StockLocationTree $tree,
        private readonly LandedCostEstimator $estimator,
    ) {
    }

    public function mayManage(?User $user): bool
    {
        return $user !== null && ($user->roleKey() === 'procurement' || $this->permissions->isGlobalAdmin($user));
    }

    /** Someone other than whoever recorded it: finance or a global admin (as for supplier payments). */
    public function mayConfirm(?User $user, ConsignmentCost $cost): bool
    {
        return $user !== null
            && $cost->state() === ConsignmentCost::PENDING
            && (int) $cost->recorded_by !== (int) $user->id
            // A global admin, or a store admin with Import costs ticked on (AdminAreas).
            && ($user->isRole('finance') || app(\App\Services\Admin\AdminAreas::class)->allows($user, 'import_costs'));
    }

    /*
    |--------------------------------------------------------------------------
    | Forming
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array{freight_route_id?: int|string|null, container_number?: ?string, bill_of_lading?: ?string, eta?: ?string, notes?: ?string}  $data
     *
     * @throws ProductIdeaException
     */
    public function create(User $by, array $data): Consignment
    {
        $this->assertManager($by);

        return DB::transaction(function () use ($by, $data): Consignment {
            $consignment = Consignment::query()->create([
                'reference' => 'CN-'.uniqid(),
                'freight_route_id' => ! empty($data['freight_route_id']) ? (int) $data['freight_route_id'] : null,
                'container_number' => $data['container_number'] ?? null,
                'bill_of_lading' => $data['bill_of_lading'] ?? null,
                'eta' => $data['eta'] ?? null,
                'notes' => $data['notes'] ?? null,
                'stage' => Consignment::FORMING,
                'stage_dates' => [Consignment::FORMING => LocalTime::dateOf()],
                'created_by' => $by->id,
            ]);

            $consignment->update(['reference' => 'CN-'.str_replace('-', '', LocalTime::dateOf()).'-'.str_pad((string) $consignment->id, 4, '0', STR_PAD_LEFT)]);

            return $consignment->refresh();
        });
    }

    /** @param  array<string, mixed>  $data @throws ProductIdeaException */
    public function update(Consignment $consignment, User $by, array $data): Consignment
    {
        $this->assertManager($by);
        $consignment->update(array_intersect_key($data, array_flip(['freight_route_id', 'container_number', 'bill_of_lading', 'eta', 'notes'])));

        return $consignment->refresh();
    }

    /**
     * How much of each line is not on a consignment yet.
     *
     * @param  Collection<int, PurchaseLine>  $lines
     * @return array<int, int> purchase line id => quantity left
     */
    public function remaining(Collection $lines): array
    {
        $taken = ConsignmentLine::query()
            ->whereIn('purchase_line_id', $lines->pluck('id'))
            ->whereHas('consignment', fn ($q) => $q->where('stage', '!=', Consignment::CANCELLED))
            ->selectRaw('purchase_line_id, SUM(quantity) as n')
            ->groupBy('purchase_line_id')
            ->pluck('n', 'purchase_line_id');

        return $lines->mapWithKeys(fn (PurchaseLine $l): array => [(int) $l->id => max(0, (int) $l->quantity - (int) ($taken[$l->id] ?? 0))])->all();
    }

    /** @throws ProductIdeaException */
    public function addLine(Consignment $consignment, User $by, int $purchaseLineId, int $quantity, ?float $cbm = null, ?float $weight = null): ConsignmentLine
    {
        $this->assertManager($by);

        return DB::transaction(function () use ($consignment, $purchaseLineId, $quantity, $cbm, $weight): ConsignmentLine {
            $consignment = Consignment::query()->lockForUpdate()->findOrFail($consignment->id);

            if ($consignment->stage !== Consignment::FORMING) {
                throw new ProductIdeaException('Goods are put on a consignment only while it is being formed.');
            }

            /** @var PurchaseLine $line */
            $line = PurchaseLine::query()->with('purchase')->lockForUpdate()->findOrFail($purchaseLineId);

            if (! in_array($line->purchase?->status, [Purchase::STATUS_ORDERED, Purchase::STATUS_PARTIALLY_RECEIVED], true)) {
                throw new ProductIdeaException('Only lines of a placed order can travel.');
            }

            if ($consignment->lines()->where('purchase_line_id', $line->id)->exists()) {
                throw new ProductIdeaException('That line is already on this consignment. Take it off to change how much.');
            }

            $left = $this->remaining(collect([$line]))[$line->id];

            if ($quantity < 1 || $quantity > $left) {
                throw new ProductIdeaException("Only {$left} of that line are left to send.");
            }

            $share = $quantity / max(1, (int) $line->quantity);

            return $consignment->lines()->create([
                'purchase_line_id' => $line->id,
                'item_variant_id' => $line->item_variant_id,
                'quantity' => $quantity,
                'cbm' => $cbm ?? ($line->cbm !== null ? round((float) $line->cbm * $share, 4) : null),
                'weight_kg' => $weight ?? ($line->weight_kg !== null ? round((float) $line->weight_kg * $share, 3) : null),
                'goods_value_etb' => round($quantity * (float) $line->unit_price * (float) ($line->purchase->exchange_rate ?: 1), 2),
            ]);
        });
    }

    /** @throws ProductIdeaException */
    public function removeLine(ConsignmentLine $line, User $by): void
    {
        $this->assertManager($by);

        if ($line->consignment->stage !== Consignment::FORMING) {
            throw new ProductIdeaException('Goods already on their way stay on the consignment.');
        }

        $line->delete();
    }

    /*
    |--------------------------------------------------------------------------
    | Stages
    |--------------------------------------------------------------------------
    */

    /** The stages it may go to next: any later one up to the dry port. @return array<int, string> */
    public function nextStages(Consignment $consignment): array
    {
        $order = [Consignment::FORMING, ...Consignment::IN_TRANSIT];
        $at = array_search($consignment->stage, $order, true);

        return $at === false ? [] : array_slice($order, $at + 1);
    }

    /** @throws ProductIdeaException */
    public function advance(Consignment $consignment, User $by, string $to): Consignment
    {
        $this->assertManager($by);

        return DB::transaction(function () use ($consignment, $by, $to): Consignment {
            $consignment = Consignment::query()->with('lines')->lockForUpdate()->findOrFail($consignment->id);

            if (! in_array($to, $this->nextStages($consignment), true)) {
                throw new ProductIdeaException("It is {$consignment->stage}: it cannot go to {$to} from here.");
            }

            if ($consignment->lines->isEmpty()) {
                throw new ProductIdeaException('Put goods on it first.');
            }

            $context = ['user_id' => $by->id, 'reference' => $consignment, 'reason' => "Consignment {$consignment->reference}"];
            $destination = $this->tree->inbound($to);

            foreach ($consignment->lines as $line) {
                if ($consignment->stage === Consignment::FORMING) {
                    // From here we own the goods: they enter the ledger.
                    $this->stock->receive((int) $line->item_variant_id, $destination, (int) $line->quantity, $context);
                } else {
                    $this->stock->move((int) $line->item_variant_id, $this->tree->inbound($consignment->stage), $destination, (int) $line->quantity, $context);
                }
            }

            $consignment->update([
                'stage' => $to,
                'stage_dates' => ($consignment->stage_dates ?? []) + [$to => LocalTime::dateOf()],
            ]);

            return $consignment->refresh();
        });
    }

    /** @throws ProductIdeaException */
    public function cancel(Consignment $consignment, User $by): Consignment
    {
        $this->assertManager($by);

        if ($consignment->stage !== Consignment::FORMING) {
            throw new ProductIdeaException('Goods already on their way cannot be cancelled here.');
        }

        $consignment->update(['stage' => Consignment::CANCELLED]);

        return $consignment->refresh();
    }

    /*
    |--------------------------------------------------------------------------
    | Costs
    |--------------------------------------------------------------------------
    */

    /**
     * @param  array{stage: string, kind: string, description?: ?string, currency: string, exchange_rate?: float|string|null, amount: float|string, allocation?: ?string, recoverable?: ?bool, reference?: ?string, paid_on?: ?string}  $data
     *
     * @throws ProductIdeaException
     */
    public function recordCost(Consignment $consignment, User $by, array $data): ConsignmentCost
    {
        $this->assertManager($by);

        if ($consignment->stage === Consignment::CANCELLED) {
            throw new ProductIdeaException('This consignment is cancelled.');
        }

        if ($consignment->costs_finalised_at !== null) {
            throw new ProductIdeaException('The costs are finalised: the items\' cost is written, so nothing more can be added.');
        }

        $kind = (string) $data['kind'];
        [, $defaultAllocation, $defaultRecoverable] = ConsignmentCost::KINDS[$kind];
        $currency = (string) $data['currency'];
        $rate = isset($data['exchange_rate']) && $data['exchange_rate'] !== '' && $data['exchange_rate'] !== null
            ? (float) $data['exchange_rate']
            : ExchangeRate::latestFor($currency);

        if ($rate === null || $rate <= 0) {
            throw new ProductIdeaException("Set an exchange rate for {$currency} first, or type one with the cost.");
        }

        $amount = round((float) $data['amount'], 2);

        return $consignment->costs()->create([
            'stage' => (string) $data['stage'],
            'kind' => $kind,
            'description' => $data['description'] ?? null,
            'currency' => $currency,
            'exchange_rate' => $rate,
            'amount' => $amount,
            'amount_etb' => round($amount * $rate, 2),
            'allocation' => $data['allocation'] ?? $defaultAllocation,
            'recoverable' => $data['recoverable'] ?? $defaultRecoverable,
            'reference' => $data['reference'] ?? null,
            'paid_on' => $data['paid_on'] ?? null,
            'recorded_by' => $by->id,
        ]);
    }

    /** @throws ProductIdeaException */
    public function confirm(ConsignmentCost $cost, User $by): ConsignmentCost
    {
        return $this->settle($cost, $by, fn (ConsignmentCost $row) => $row->update(['confirmed_by' => $by->id, 'confirmed_at' => now()]));
    }

    /** @throws ProductIdeaException */
    public function reject(ConsignmentCost $cost, User $by, string $reason): ConsignmentCost
    {
        return $this->settle($cost, $by, fn (ConsignmentCost $row) => $row->update(['rejected_by' => $by->id, 'rejected_at' => now(), 'reject_reason' => $reason]));
    }

    /** Whoever recorded a cost may take it back while it waits. @throws ProductIdeaException */
    public function deleteCost(ConsignmentCost $cost, User $by): void
    {
        if ($cost->state() !== ConsignmentCost::PENDING || (int) $cost->recorded_by !== (int) $by->id) {
            throw new ProductIdeaException('Only a cost you recorded, still waiting, can be taken back.', 403);
        }

        $cost->delete();
    }

    /**
     * @param  callable(ConsignmentCost): mixed  $change
     *
     * @throws ProductIdeaException
     */
    private function settle(ConsignmentCost $cost, User $by, callable $change): ConsignmentCost
    {
        return DB::transaction(function () use ($cost, $by, $change): ConsignmentCost {
            /** @var ConsignmentCost $row */
            $row = ConsignmentCost::query()->lockForUpdate()->findOrFail($cost->id);

            if ($row->state() !== ConsignmentCost::PENDING) {
                throw new ProductIdeaException('This cost was already '.$row->state().'.');
            }

            if ((int) $row->recorded_by === (int) $by->id) {
                throw new ProductIdeaException('You recorded this cost yourself. A second person has to confirm it.', 403);
            }

            if (! $this->mayConfirm($by, $row)) {
                throw new ProductIdeaException('Only finance or a global admin confirms import costs.', 403);
            }

            $change($row);

            return $row->refresh();
        });
    }

    /*
    |--------------------------------------------------------------------------
    | Spreading the costs
    |--------------------------------------------------------------------------
    */

    /**
     * Each line's share of the confirmed costs, and what one unit of it has
     * cost by now (goods + its share of every confirmed cost but VAT and
     * withholding). Shares are split to the cent and always add up.
     *
     * @return array{lines: array<int, array<string, mixed>>, warnings: array<int, string>}
     */
    public function allocation(Consignment $consignment): array
    {
        $consignment->loadMissing(['lines', 'costs']);
        $lines = $consignment->lines->sortBy('id')->values();
        $warnings = [];
        $byLine = $lines->mapWithKeys(fn (ConsignmentLine $l): array => [(int) $l->id => ['cost' => 0.0, 'recoverable' => 0.0]])->all();

        foreach ($consignment->costs->filter(fn (ConsignmentCost $c): bool => $c->state() === ConsignmentCost::CONFIRMED) as $cost) {
            $basis = $this->basis($lines, (string) $cost->allocation);

            if (array_sum($basis) <= 0) {
                $warnings[] = "{$cost->label()} is spread by value: no line has a {$cost->allocation}.";
                $basis = $this->basis($lines, 'value');
            }

            foreach (self::split((float) $cost->amount_etb, $basis) as $lineId => $share) {
                $byLine[$lineId][$cost->recoverable ? 'recoverable' : 'cost'] += $share;
            }
        }

        return [
            'lines' => $lines->map(function (ConsignmentLine $l) use ($byLine): array {
                $goods = (float) $l->goods_value_etb;
                $costs = round($byLine[$l->id]['cost'], 2);

                return [
                    'id' => (int) $l->id,
                    'goods_value_etb' => $goods,
                    'costs_etb' => $costs,
                    'recoverable_etb' => round($byLine[$l->id]['recoverable'], 2),
                    'landed_total_etb' => round($goods + $costs, 2),
                    'landed_unit_etb' => $l->quantity > 0 ? round(($goods + $costs) / $l->quantity, 2) : null,
                ];
            })->all(),
            'warnings' => array_values(array_unique($warnings)),
        ];
    }

    /**
     * @param  Collection<int, ConsignmentLine>  $lines
     * @return array<int, float> line id => its weight in the split
     */
    private function basis(Collection $lines, string $allocation): array
    {
        return $lines->mapWithKeys(fn (ConsignmentLine $l): array => [(int) $l->id => max(0.0, (float) match ($allocation) {
            'cbm' => $l->cbm ?? 0,
            'weight' => $l->weight_kg ?? 0,
            default => $l->goods_value_etb,
        })])->all();
    }

    /**
     * Split an amount in proportion, in whole cents, handing leftover cents
     * to the largest remainders so the parts add up exactly.
     *
     * @param  array<int, float>  $weights
     * @return array<int, float>
     */
    public static function split(float $amount, array $weights): array
    {
        $total = array_sum($weights);
        $cents = (int) round($amount * 100);

        if ($total <= 0 || $weights === []) {
            return array_map(fn () => 0.0, $weights);
        }

        $raw = array_map(fn (float $w): float => $cents * $w / $total, $weights);
        $floor = array_map(fn (float $r): int => (int) floor($r), $raw);
        $left = $cents - array_sum($floor);

        $order = array_keys($raw);
        usort($order, fn ($a, $b): int => ($raw[$b] - $floor[$b]) <=> ($raw[$a] - $floor[$a]) ?: $a <=> $b);

        foreach (array_slice($order, 0, $left) as $key) {
            $floor[$key]++;
        }

        return array_map(fn (int $c): float => $c / 100, $floor);
    }

    /**
     * What the route and tariffs said it would cost, per cost kind, against
     * what has been confirmed, so the estimate can be judged.
     *
     * @return array<int, array{kind: string, label: string, estimated: float, actual: float, pending: float}>
     */
    public function comparison(Consignment $consignment): array
    {
        $consignment->loadMissing(['lines.variant.item', 'costs', 'route']);
        $route = $consignment->route;
        $routeRate = $route ? ExchangeRate::latestFor((string) $route->currency) : null;
        $estimated = [];

        foreach ($consignment->lines as $line) {
            $tariff = Tariff::forCode($line->variant?->item?->hs_code);
            $e = $this->estimator->estimate([
                'quantity' => (int) $line->quantity,
                'unit_price' => $line->quantity > 0 ? (float) $line->goods_value_etb / (int) $line->quantity : 0.0,
                'rate' => 1.0,
                'pieces_per_carton' => max(1, (int) $line->quantity),
                'cbm_per_carton' => $line->cbm !== null ? (float) $line->cbm : null,
                'route' => $route ? array_combine(FreightRoute::FIGURES, array_map(fn (string $k): float => (float) $route->{$k}, FreightRoute::FIGURES)) : null,
                'route_rate' => $routeRate,
                'tariff' => $tariff ? array_combine(Tariff::RATES, array_map(fn (string $k): float => (float) $tariff->{$k}, Tariff::RATES)) : null,
            ]);

            foreach ($e['lines'] as $row) {
                $estimated[$row['key']] = ($estimated[$row['key']] ?? 0) + $row['amount'];
            }
        }

        return collect(ConsignmentCost::KINDS)->map(function (array $meta, string $kind) use ($consignment, $estimated): array {
            $costs = $consignment->costs->where('kind', $kind);

            return [
                'kind' => $kind,
                'label' => $meta[0],
                'estimated' => round((float) ($estimated[$kind] ?? 0), 2),
                'actual' => round((float) $costs->filter(fn (ConsignmentCost $c): bool => $c->state() === ConsignmentCost::CONFIRMED)->sum('amount_etb'), 2),
                'pending' => round((float) $costs->filter(fn (ConsignmentCost $c): bool => $c->state() === ConsignmentCost::PENDING)->sum('amount_etb'), 2),
            ];
        })->filter(fn (array $r): bool => $r['estimated'] != 0 || $r['actual'] != 0 || $r['pending'] != 0)->values()->all();
    }

    /** @throws ProductIdeaException */
    private function assertManager(User $by): void
    {
        if (! $this->mayManage($by)) {
            throw new ProductIdeaException('Only procurement or a global admin handles consignments.', 403);
        }
    }
}
