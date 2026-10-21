<?php

declare(strict_types=1);

namespace App\Services\Procurement;

use App\Exceptions\ProductIdeaException;
use App\Models\Auth\User;
use App\Models\Procurement\ExchangeRate;
use App\Models\Procurement\FreightRoute;
use App\Models\Procurement\PriceCheck;
use App\Models\Procurement\ProductIdea;
use App\Models\Procurement\SupplierQuote;
use App\Models\Procurement\Tariff;
use App\Services\Inventory\StockPermissions;
use Illuminate\Support\Collection;

/**
 * Supplier quotes on a product idea, and what each would cost on the shelf
 * (docs/plans/procurement-pipeline.md, PP3).
 *
 * Procurement (or a global admin) takes quotes while the idea is with
 * procurement. Each quote saves its estimate (LandedCostEstimator) so later
 * changes of rates, routes or tariffs never rewrite it; "Recalculate" takes
 * the current ones, the latest exchange rate included.
 *
 * Costs are for procurement, admins (a store admin for their store's ideas)
 * and dev. Sellers and store managers never see them.
 */
class SupplierQuoteService
{
    public function __construct(
        private readonly StockPermissions $permissions,
        private readonly LandedCostEstimator $estimator,
    ) {
    }

    public function mayQuote(?User $user, ProductIdea $idea): bool
    {
        return $idea->status === ProductIdea::SOURCING
            && ($user?->roleKey() === 'procurement' || $this->permissions->isGlobalAdmin($user));
    }

    public function maySeeCosts(?User $user, ProductIdea $idea): bool
    {
        if ($user === null) {
            return false;
        }

        return $user->roleKey() === 'procurement'
            || $this->permissions->isAdminOf($user, $idea->store_id !== null ? (int) $idea->store_id : null);
    }

    /**
     * @param  array<string, mixed>  $data  validated SaveSupplierQuoteRequest fields
     *
     * @throws ProductIdeaException
     */
    public function save(ProductIdea $idea, User $by, array $data, ?SupplierQuote $quote = null): SupplierQuote
    {
        if (! $this->mayQuote($by, $idea)) {
            throw new ProductIdeaException($idea->status === ProductIdea::SOURCING
                ? 'Only procurement or a global admin takes quotes.'
                : 'Quotes are taken while the idea is with procurement.', 403);
        }

        $currency = (string) $data['currency'];
        $rate = isset($data['exchange_rate']) && $data['exchange_rate'] !== '' && $data['exchange_rate'] !== null
            ? (float) $data['exchange_rate']
            : ExchangeRate::latestFor($currency);

        if ($rate === null || $rate <= 0) {
            throw new ProductIdeaException("Set an exchange rate for {$currency} first, or type one on the quote.");
        }

        $moq = max(1, (int) ($data['moq'] ?? 1));
        $fields = [
            'supplier_id' => (int) $data['supplier_id'],
            'currency' => $currency,
            'exchange_rate' => $rate,
            'unit_price' => (float) $data['unit_price'],
            'moq' => $moq,
            'pieces_per_carton' => max(1, (int) ($data['pieces_per_carton'] ?? 1)),
            'cbm_per_carton' => $this->number($data['cbm_per_carton'] ?? null),
            'kg_per_carton' => $this->number($data['kg_per_carton'] ?? null),
            'lead_days' => isset($data['lead_days']) && $data['lead_days'] !== '' ? (int) $data['lead_days'] : null,
            'valid_until' => $data['valid_until'] ?? null,
            'hs_code' => Tariff::normalise($data['hs_code'] ?? null),
            'freight_route_id' => ! empty($data['freight_route_id']) ? (int) $data['freight_route_id'] : null,
            'quantity' => max($moq, (int) ($data['quantity'] ?? $moq)),
            'overrides' => $this->overrides($data['overrides'] ?? []),
            'notes' => isset($data['notes']) && trim((string) $data['notes']) !== '' ? trim((string) $data['notes']) : null,
        ];

        $quote ??= new SupplierQuote(['product_idea_id' => $idea->id, 'created_by' => $by->id]);
        $quote->fill($fields);
        $quote->estimate = $this->estimate($quote);
        $quote->save();

        return $quote->refresh();
    }

    /** Take today's rates, route and tariff (the latest exchange rate too). @throws ProductIdeaException */
    public function recalculate(SupplierQuote $quote, User $by): SupplierQuote
    {
        if (! $this->mayQuote($by, $quote->idea)) {
            throw new ProductIdeaException('Quotes are recalculated while the idea is with procurement.', 403);
        }

        $quote->exchange_rate = ExchangeRate::latestFor((string) $quote->currency) ?? $quote->exchange_rate;
        $quote->estimate = $this->estimate($quote);
        $quote->save();

        return $quote->refresh();
    }

    /** @throws ProductIdeaException */
    public function delete(SupplierQuote $quote, User $by): void
    {
        if (! $this->mayQuote($by, $quote->idea)) {
            throw new ProductIdeaException('Quotes are removed while the idea is with procurement.', 403);
        }

        $quote->delete();
    }

    /**
     * The breakdown for a quote with the figures as they are now.
     *
     * @return array<string, mixed>
     */
    public function estimate(SupplierQuote $quote): array
    {
        $route = $quote->freight_route_id !== null ? FreightRoute::query()->find($quote->freight_route_id) : null;
        $tariff = Tariff::forCode($quote->hs_code);
        $figures = null;
        $routeRate = null;

        if ($route !== null) {
            $figures = [];
            foreach (FreightRoute::FIGURES as $key) {
                $figures[$key] = (float) ($quote->overrides[$key] ?? $route->{$key});
            }
            $routeRate = $route->currency === $quote->currency ? (float) $quote->exchange_rate : ExchangeRate::latestFor((string) $route->currency);
        }

        $estimate = $this->estimator->estimate([
            'quantity' => (int) $quote->quantity,
            'unit_price' => (float) $quote->unit_price,
            'rate' => (float) $quote->exchange_rate > 0 ? (float) $quote->exchange_rate : null,
            'pieces_per_carton' => (int) $quote->pieces_per_carton,
            'cbm_per_carton' => $quote->cbm_per_carton !== null ? (float) $quote->cbm_per_carton : null,
            'route' => $figures,
            'route_rate' => $routeRate,
            'tariff' => $tariff ? array_combine(Tariff::RATES, array_map(fn (string $k): float => (float) $tariff->{$k}, Tariff::RATES)) : null,
        ]);

        return $estimate + [
            'exchange_rate' => (float) $quote->exchange_rate,
            'route' => $route ? ['id' => (int) $route->id, 'name' => (string) $route->name, 'currency' => (string) $route->currency, 'rate' => $routeRate] : null,
            'tariff' => $tariff ? ['hs_code' => (string) $tariff->hs_code, 'description' => $tariff->description] + array_combine(Tariff::RATES, array_map(fn (string $k): float => (float) $tariff->{$k}, Tariff::RATES)) : null,
            'calculated_at' => now()->toIso8601String(),
        ];
    }

    /*
    |--------------------------------------------------------------------------
    | Presenting
    |--------------------------------------------------------------------------
    */

    /**
     * Margin against what the store would sell one for, and against the
     * median other shops charge (verified prices only).
     *
     * @return array<string, mixed>
     */
    public function present(SupplierQuote $quote, ?float $target, ?float $marketMedian): array
    {
        $quote->loadMissing(['supplier', 'route', 'creator']);
        $estimate = $quote->estimate ?? [];
        $cost = $estimate['cost_per_piece'] ?? null;

        $margin = fn (?float $price): ?array => $price !== null && $price > 0 && $cost !== null
            ? ['amount' => round($price - $cost, 2), 'pct' => round(($price - $cost) / $price * 100, 1)]
            : null;

        return [
            'id' => (int) $quote->id,
            'supplier' => ['id' => (int) $quote->supplier_id, 'name' => (string) ($quote->supplier?->name ?? '')],
            'currency' => (string) $quote->currency,
            'exchange_rate' => (float) $quote->exchange_rate,
            'unit_price' => (float) $quote->unit_price,
            'moq' => (int) $quote->moq,
            'pieces_per_carton' => (int) $quote->pieces_per_carton,
            'cbm_per_carton' => $quote->cbm_per_carton !== null ? (float) $quote->cbm_per_carton : null,
            'kg_per_carton' => $quote->kg_per_carton !== null ? (float) $quote->kg_per_carton : null,
            'lead_days' => $quote->lead_days,
            'valid_until' => $quote->valid_until?->toDateString(),
            'hs_code' => $quote->hs_code,
            'freight_route_id' => $quote->freight_route_id !== null ? (int) $quote->freight_route_id : null,
            'quantity' => (int) $quote->quantity,
            'overrides' => (object) ($quote->overrides ?? []),
            'notes' => $quote->notes,
            'created_by' => $quote->creator ? (trim($quote->creator->first_name.' '.$quote->creator->last_name) ?: (string) $quote->creator->email) : null,
            'estimate' => $estimate === [] ? null : $estimate,
            'margin' => $margin($target),
            'margin_vs_market' => $margin($marketMedian),
        ];
    }

    /**
     * Everything the quotes screen needs about an idea's costs.
     *
     * @return array{quotes: array<int, array<string, mixed>>, target: ?float, market: array<string, mixed>, best: ?int}
     */
    public function board(ProductIdea $idea): array
    {
        $idea->loadMissing(['quotes.supplier', 'quotes.route', 'quotes.creator', 'priceChecks.observations']);
        $market = PriceCheckService::summary($idea->priceChecks->flatMap(fn (PriceCheck $c) => $c->observations));
        $target = $idea->target_price !== null ? (float) $idea->target_price : null;

        $quotes = $idea->quotes->sortBy('id')->map(fn (SupplierQuote $q): array => $this->present($q, $target, $market['median']))->values();

        return [
            'quotes' => $quotes->all(),
            'target' => $target,
            'market' => $market,
            'best' => self::cheapest($quotes),
        ];
    }

    /** @param  Collection<int, array<string, mixed>>  $quotes */
    private static function cheapest(Collection $quotes): ?int
    {
        $complete = $quotes->filter(fn (array $q): bool => ($q['estimate']['complete'] ?? false) && $q['estimate']['cost_per_piece'] !== null);

        return $complete->isEmpty() ? null : (int) $complete->sortBy(fn (array $q) => $q['estimate']['cost_per_piece'])->first()['id'];
    }

    /**
     * @param  array<string, mixed>|null  $raw
     * @return array<string, float>|null
     */
    private function overrides(?array $raw): ?array
    {
        $kept = [];
        foreach (FreightRoute::FIGURES as $key) {
            if (isset($raw[$key]) && $raw[$key] !== '' && $raw[$key] !== null) {
                $kept[$key] = (float) $raw[$key];
            }
        }

        return $kept === [] ? null : $kept;
    }

    private function number(mixed $value): ?float
    {
        return $value === null || $value === '' ? null : (float) $value;
    }
}
