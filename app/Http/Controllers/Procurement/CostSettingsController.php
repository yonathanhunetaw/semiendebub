<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\SaveFreightRouteRequest;
use App\Http\Requests\Procurement\SetExchangeRateRequest;
use App\Models\Procurement\ExchangeRate;
use App\Models\Procurement\FreightRoute;
use App\Models\Procurement\Tariff;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The figures estimates are made from: the latest exchange rate per currency
 * and what each freight route costs per CBM. The tariff table has its own page.
 */
class CostSettingsController extends Controller
{
    public function index(): Response
    {
        $home = config('procurement.home_currency', 'ETB');

        $rates = collect(config('procurement.currencies', []))
            ->reject(fn (string $c): bool => $c === $home)
            ->map(function (string $currency): array {
                $rows = ExchangeRate::query()->where('currency', $currency)->with('setter')->latest('id')->limit(5)->get();

                return [
                    'currency' => $currency,
                    'rate' => $rows->first() ? (float) $rows->first()->rate : null,
                    'history' => $rows->map(fn (ExchangeRate $r): array => [
                        'rate' => (float) $r->rate,
                        'at' => $r->created_at?->toIso8601String(),
                        'by' => $r->setter ? (trim($r->setter->first_name.' '.$r->setter->last_name) ?: (string) $r->setter->email) : null,
                    ])->all(),
                ];
            })->values()->all();

        return Inertia::render('Procurement/Costs/Index', [
            'rates' => $rates,
            'routes' => FreightRoute::query()->orderByDesc('is_active')->orderBy('name')->get()->map(fn (FreightRoute $r): array => [
                'id' => (int) $r->id,
                'name' => (string) $r->name,
                'origin' => $r->origin,
                'currency' => (string) $r->currency,
                'transit_days' => $r->transit_days,
                'notes' => $r->notes,
                'is_active' => (bool) $r->is_active,
            ] + array_combine(FreightRoute::FIGURES, array_map(fn (string $k): float => (float) $r->{$k}, FreightRoute::FIGURES)))->all(),
            'currencies' => config('procurement.currencies', []),
            'tariffCount' => Tariff::query()->count(),
        ]);
    }

    public function setRate(SetExchangeRateRequest $request): RedirectResponse
    {
        $rate = ExchangeRate::query()->create($request->validated() + ['set_by' => $request->user()->id]);

        return back()->with('success', "1 {$rate->currency} = ETB ".number_format((float) $rate->rate, 4).' from now on.');
    }

    public function storeRoute(SaveFreightRouteRequest $request): RedirectResponse
    {
        $route = FreightRoute::query()->create($request->validated() + ['created_by' => $request->user()->id]);

        return back()->with('success', "Route {$route->name} added.");
    }

    public function updateRoute(SaveFreightRouteRequest $request, FreightRoute $freightRoute): RedirectResponse
    {
        $freightRoute->update($request->validated());

        return back()->with('success', "Route {$freightRoute->name} saved. Existing quotes keep their estimate until recalculated.");
    }
}
