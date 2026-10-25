<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Procurement\Tariff;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Shared\CsvTable;

final class TariffsDataset extends Dataset
{
    private const RATES = ['duty_pct', 'excise_pct', 'vat_pct', 'surtax_pct', 'withholding_pct', 'other_pct'];

    public function key(): string
    {
        return 'tariffs';
    }

    public function label(): string
    {
        return 'Tariffs (HS codes)';
    }

    public function group(): string
    {
        return 'Procurement';
    }

    public function description(): string
    {
        return 'Duty and tax rates by HS code, in percent. A row is matched by its HS code (dots and spaces are ignored).';
    }

    public function columns(): array
    {
        return ['hs_code', 'description', ...self::RATES, 'notes'];
    }

    public function required(): array
    {
        return ['hs_code'];
    }

    public function unique(): array
    {
        return [];
    }

    public function example(): array
    {
        return ['4202.22', 'Handbags with outer surface of plastic', 30, 0, 15, 10, 3, 0, ''];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        foreach (Tariff::query()->orderBy('hs_code')->cursor() as $t) {
            yield [$t->hs_code, $t->description, $t->duty_pct, $t->excise_pct, $t->vat_pct, $t->surtax_pct, $t->withholding_pct, $t->other_pct, $t->notes];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);
        $seen = [];

        foreach ($table->rows as $row) {
            $d = $row['data'];
            $code = Tariff::normalise($d['hs_code']);
            if ($code === null) {
                $table->error("hs_code '{$d['hs_code']}' has no digits", $row['line']);

                continue;
            }
            if (isset($seen[$code])) {
                $table->error("HS code {$code} is already on line {$seen[$code]}", $row['line']);

                continue;
            }
            $seen[$code] = $row['line'];

            $values = [];
            foreach (self::RATES as $rate) {
                if (isset($have[$rate])) {
                    $value = $table->decimal($row, $rate);
                    if ($value !== null && ($value < 0 || $value > 1000)) {
                        $table->error("{$rate} {$value} is out of range", $row['line']);
                    }
                    $values[$rate] = $value ?? 0;
                }
            }
            foreach (['description', 'notes'] as $text) {
                if (isset($have[$text])) {
                    $values[$text] = $d[$text] === '' ? null : $d[$text];
                }
            }

            $existing = Tariff::query()->where('hs_code', $code)->first();
            $this->queue($plan, $code, $existing, $values, function () use ($code, $values, $by): void {
                Tariff::query()->updateOrCreate(['hs_code' => $code], $values + ['updated_by' => $by->id]);
            });
        }

        return $plan;
    }
}
