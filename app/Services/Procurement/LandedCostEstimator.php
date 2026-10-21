<?php

declare(strict_types=1);

namespace App\Services\Procurement;

/**
 * What a quantity of goods costs by the time it is on a store's shelf, in ETB.
 * A pure calculation: SupplierQuoteService gathers the figures.
 *
 *   goods (FOB)      quantity × unit price × exchange rate
 *   storage          CBM × overseas storage per CBM (route currency)
 *   freight          CBM × sea freight per CBM (route currency)
 *   insurance        goods × insurance %
 *   customs value    CIF = goods + freight + insurance
 *   duty             CIF × duty %
 *   excise           (CIF + duty) × excise %
 *   VAT              (CIF + duty + excise) × VAT %                 recoverable
 *   surtax           (CIF + duty + excise + VAT) × surtax %
 *   withholding      CIF × withholding %                           recoverable
 *   other            CIF × other %
 *   port & clearing, land transport, to the store: CBM × their ETB rate
 *
 * Cost is everything but the recoverable taxes: the business is VAT-registered
 * and claims VAT back, and withholding is a prepayment of its income tax
 * (owner, 2026-10-21). Both still show, and count in the cash paid out.
 *
 * A missing figure is never guessed: it is left at 0 and named in `warnings`,
 * and `complete` is false.
 */
class LandedCostEstimator
{
    /**
     * @param  array{
     *     quantity: int,
     *     unit_price: float,
     *     rate: ?float,
     *     pieces_per_carton: int,
     *     cbm_per_carton: ?float,
     *     route: ?array{overseas_storage_per_cbm: float, sea_freight_per_cbm: float, insurance_pct: float, port_clearing_per_cbm: float, land_transport_per_cbm: float, to_store_per_cbm: float},
     *     route_rate: ?float,
     *     tariff: ?array{duty_pct: float, excise_pct: float, vat_pct: float, surtax_pct: float, withholding_pct: float, other_pct: float},
     * }  $in
     * @return array{
     *     quantity: int, cartons: int, cbm: float,
     *     lines: array<int, array{key: string, label: string, amount: float, cost: bool}>,
     *     goods: float, customs_value: float, cost_total: float, recoverable_total: float, cash_total: float,
     *     cost_per_piece: ?float, complete: bool, warnings: array<int, string>,
     * }
     */
    public function estimate(array $in): array
    {
        $warnings = [];
        $quantity = max(0, (int) $in['quantity']);
        $perCarton = max(1, (int) $in['pieces_per_carton']);
        $cartons = (int) ceil($quantity / $perCarton);

        if ($in['rate'] === null) {
            $warnings[] = 'No exchange rate for the quote\'s currency.';
        }

        if ($in['cbm_per_carton'] === null) {
            $warnings[] = 'No size (CBM) per carton, so shipping is not counted.';
        }

        if ($in['route'] === null) {
            $warnings[] = 'No route picked, so shipping and handling are not counted.';
        } elseif ($in['route_rate'] === null) {
            $warnings[] = 'No exchange rate for the route\'s currency, so overseas storage and sea freight are not counted.';
        }

        if ($in['tariff'] === null) {
            $warnings[] = 'No tariff for this HS code, so import taxes are not counted.';
        }

        $cbm = $cartons * (float) ($in['cbm_per_carton'] ?? 0);
        $route = $in['route'] ?? array_fill_keys(['overseas_storage_per_cbm', 'sea_freight_per_cbm', 'insurance_pct', 'port_clearing_per_cbm', 'land_transport_per_cbm', 'to_store_per_cbm'], 0.0);
        $routeRate = (float) ($in['route_rate'] ?? 0);
        $tax = $in['tariff'] ?? array_fill_keys(['duty_pct', 'excise_pct', 'vat_pct', 'surtax_pct', 'withholding_pct', 'other_pct'], 0.0);
        $pct = fn (string $key): float => (float) $tax[$key] / 100;

        $goods = $quantity * (float) $in['unit_price'] * (float) ($in['rate'] ?? 0);
        $storage = $cbm * (float) $route['overseas_storage_per_cbm'] * $routeRate;
        $freight = $cbm * (float) $route['sea_freight_per_cbm'] * $routeRate;
        $insurance = $goods * (float) $route['insurance_pct'] / 100;
        $cif = $goods + $freight + $insurance;

        $duty = $cif * $pct('duty_pct');
        $excise = ($cif + $duty) * $pct('excise_pct');
        $vat = ($cif + $duty + $excise) * $pct('vat_pct');
        $surtax = ($cif + $duty + $excise + $vat) * $pct('surtax_pct');
        $withholding = $cif * $pct('withholding_pct');
        $other = $cif * $pct('other_pct');

        $lines = [
            ['goods', 'Goods (supplier price)', $goods, true],
            ['storage', 'Overseas storage', $storage, true],
            ['freight', 'Sea freight', $freight, true],
            ['insurance', 'Insurance', $insurance, true],
            ['duty', 'Customs duty', $duty, true],
            ['excise', 'Excise tax', $excise, true],
            ['vat', 'VAT (claimed back)', $vat, false],
            ['surtax', 'Surtax', $surtax, true],
            ['withholding', 'Withholding (claimed back)', $withholding, false],
            ['other', 'Other levies', $other, true],
            ['port', 'Port & clearing', $cbm * (float) $route['port_clearing_per_cbm'], true],
            ['land', 'Transport to the land port', $cbm * (float) $route['land_transport_per_cbm'], true],
            ['to_store', 'Main store to store', $cbm * (float) $route['to_store_per_cbm'], true],
        ];

        $rows = array_map(fn (array $l): array => ['key' => $l[0], 'label' => $l[1], 'amount' => round($l[2], 2), 'cost' => $l[3]], $lines);
        $cost = array_sum(array_map(fn (array $r): float => $r['cost'] ? $r['amount'] : 0.0, $rows));
        $recoverable = array_sum(array_map(fn (array $r): float => $r['cost'] ? 0.0 : $r['amount'], $rows));

        return [
            'quantity' => $quantity,
            'cartons' => $cartons,
            'cbm' => round($cbm, 3),
            'lines' => $rows,
            'goods' => round($goods, 2),
            'customs_value' => round($cif, 2),
            'cost_total' => round($cost, 2),
            'recoverable_total' => round($recoverable, 2),
            'cash_total' => round($cost + $recoverable, 2),
            'cost_per_piece' => $quantity > 0 ? round($cost / $quantity, 2) : null,
            'complete' => $warnings === [],
            'warnings' => $warnings,
        ];
    }
}
