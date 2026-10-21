<?php

declare(strict_types=1);

namespace Tests\Unit\Procurement;

use App\Services\Procurement\LandedCostEstimator;
use PHPUnit\Framework\Attributes\Test;
use PHPUnit\Framework\TestCase;

/**
 * The landed-cost sum, worked by hand: 1,000 flash drives at USD 2, 100 to a
 * 0.05 CBM carton, 1 USD = ETB 150.
 */
class LandedCostEstimatorTest extends TestCase
{
    /** @return array<string, mixed> */
    private function input(array $overrides = []): array
    {
        return $overrides + [
            'quantity' => 1000,
            'unit_price' => 2.0,
            'rate' => 150.0,
            'pieces_per_carton' => 100,
            'cbm_per_carton' => 0.05,
            'route' => [
                'overseas_storage_per_cbm' => 10.0,
                'sea_freight_per_cbm' => 200.0,
                'insurance_pct' => 1.0,
                'port_clearing_per_cbm' => 4000.0,
                'land_transport_per_cbm' => 2000.0,
                'to_store_per_cbm' => 1000.0,
            ],
            'route_rate' => 150.0,
            'tariff' => ['duty_pct' => 20.0, 'excise_pct' => 0.0, 'vat_pct' => 15.0, 'surtax_pct' => 10.0, 'withholding_pct' => 3.0, 'other_pct' => 0.0],
        ];
    }

    /** @param  array<string, mixed>  $estimate */
    private function line(array $estimate, string $key): float
    {
        foreach ($estimate['lines'] as $line) {
            if ($line['key'] === $key) {
                return $line['amount'];
            }
        }

        $this->fail("No line {$key}");
    }

    #[Test]
    public function taxes_cascade_and_vat_and_withholding_are_left_out_of_cost(): void
    {
        $e = (new LandedCostEstimator())->estimate($this->input());

        $this->assertSame([10, 0.5], [$e['cartons'], $e['cbm']]);
        $this->assertSame(300000.0, $e['goods']);
        $this->assertSame(750.0, $this->line($e, 'storage'));
        $this->assertSame(15000.0, $this->line($e, 'freight'));
        $this->assertSame(3000.0, $this->line($e, 'insurance'));
        $this->assertSame(318000.0, $e['customs_value']);           // goods + freight + insurance
        $this->assertSame(63600.0, $this->line($e, 'duty'));          // 20% of CIF
        $this->assertSame(57240.0, $this->line($e, 'vat'));           // 15% of CIF + duty
        $this->assertSame(43884.0, $this->line($e, 'surtax'));        // 10% of CIF + duty + VAT
        $this->assertSame(9540.0, $this->line($e, 'withholding'));    // 3% of CIF
        $this->assertSame(2000.0, $this->line($e, 'port'));
        $this->assertSame(1000.0, $this->line($e, 'land'));
        $this->assertSame(500.0, $this->line($e, 'to_store'));

        $this->assertSame(429734.0, $e['cost_total']);
        $this->assertSame(66780.0, $e['recoverable_total']);
        $this->assertSame(496514.0, $e['cash_total']);
        $this->assertSame(429.73, $e['cost_per_piece']);
        $this->assertTrue($e['complete']);
    }

    #[Test]
    public function excise_sits_between_duty_and_vat(): void
    {
        $tariff = ['duty_pct' => 10.0, 'excise_pct' => 10.0, 'vat_pct' => 10.0, 'surtax_pct' => 0.0, 'withholding_pct' => 0.0, 'other_pct' => 0.0];
        $e = (new LandedCostEstimator())->estimate($this->input(['tariff' => $tariff, 'route' => null, 'route_rate' => null]));

        // CIF 300,000 → duty 30,000 → excise 33,000 → VAT on 363,000.
        $this->assertSame(30000.0, $this->line($e, 'duty'));
        $this->assertSame(33000.0, $this->line($e, 'excise'));
        $this->assertSame(36300.0, $this->line($e, 'vat'));
    }

    #[Test]
    public function a_part_carton_ships_as_a_whole_carton(): void
    {
        $e = (new LandedCostEstimator())->estimate($this->input(['quantity' => 1001]));

        $this->assertSame([11, 0.55], [$e['cartons'], $e['cbm']]);
    }

    #[Test]
    public function missing_figures_are_named_not_guessed(): void
    {
        $e = (new LandedCostEstimator())->estimate($this->input(['cbm_per_carton' => null, 'route' => null, 'route_rate' => null, 'tariff' => null]));

        $this->assertFalse($e['complete']);
        $this->assertCount(3, $e['warnings']);
        $this->assertSame(300000.0, $e['cost_total']);
        $this->assertSame(300.0, $e['cost_per_piece']);
    }

    #[Test]
    public function no_exchange_rate_is_a_warning_and_counts_nothing_for_the_goods(): void
    {
        $e = (new LandedCostEstimator())->estimate($this->input(['rate' => null]));

        $this->assertFalse($e['complete']);
        $this->assertSame(0.0, $e['goods']);
    }
}
