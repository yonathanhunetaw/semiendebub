<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Procurement\Supplier;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Shared\CsvTable;

final class SuppliersDataset extends Dataset
{
    private const TEXT = ['country', 'city', 'currency', 'phone', 'email', 'address', 'default_payment_terms', 'notes'];

    public function key(): string
    {
        return 'suppliers';
    }

    public function label(): string
    {
        return 'Suppliers';
    }

    public function group(): string
    {
        return 'Procurement';
    }

    public function description(): string
    {
        return 'The shops procurement buys from. A row is matched by id, or by name and country.';
    }

    public function columns(): array
    {
        return ['id', 'name', 'country', 'city', 'currency', 'phone', 'email', 'address', 'default_payment_terms', 'default_payment_days', 'notes', 'is_active'];
    }

    public function required(): array
    {
        return ['name'];
    }

    public function example(): array
    {
        return ['', 'Guangzhou Bags Ltd', 'China', 'Guangzhou', 'USD', '+86 20 0000 0000', 'sales@example.com', '', 'Net 30', 30, '', 'yes'];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        foreach (Supplier::query()->orderBy('id')->lazyById(500) as $s) {
            yield [$s->id, $s->name, $s->country, $s->city, $s->currency, $s->phone, $s->email, $s->address, $s->default_payment_terms, $s->default_payment_days, $s->notes, $s->is_active ? 'yes' : 'no'];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);
        $seen = [];

        foreach ($table->rows as $row) {
            $d = $row['data'];
            if ($d['name'] === '') {
                $table->error('name is empty', $row['line']);

                continue;
            }
            $id = isset($have['id']) ? $table->int($row, 'id') : null;
            $days = isset($have['default_payment_days']) ? $table->int($row, 'default_payment_days') : null;
            $active = isset($have['is_active']) ? $table->bool($row, 'is_active') : null;

            $existing = $id !== null
                ? Supplier::query()->find($id)
                : Supplier::query()->where('name', $d['name'])->when(($d['country'] ?? '') !== '', fn ($q) => $q->where('country', $d['country']))->first();
            if ($id !== null && $existing === null) {
                $table->error("there is no supplier {$id}", $row['line']);

                continue;
            }
            $key = $existing?->id ?? 'new:'.mb_strtolower($d['name'].'|'.($d['country'] ?? ''));
            if (isset($seen[$key])) {
                $table->error("'{$d['name']}' is already on line {$seen[$key]}", $row['line']);

                continue;
            }
            $seen[$key] = $row['line'];

            $values = ['name' => $d['name']];
            foreach (self::TEXT as $column) {
                if (isset($have[$column])) {
                    $values[$column] = $d[$column] === '' ? null : $d[$column];
                }
            }
            if (isset($have['default_payment_days'])) {
                $values['default_payment_days'] = $days;
            }
            if ($active !== null) {
                $values['is_active'] = $active;
            }

            $this->queue($plan, $d['name'], $existing, $values, function () use ($existing, $values, $by): void {
                $existing !== null
                    ? $existing->update($values)
                    : Supplier::query()->create($values + ['is_active' => true, 'created_by' => $by->id]);
            });
        }

        return $plan;
    }
}
