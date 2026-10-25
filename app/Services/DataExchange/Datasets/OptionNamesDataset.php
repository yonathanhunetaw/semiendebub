<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Shared\CsvTable;
use Illuminate\Database\Eloquent\Model;

/**
 * The names an item's options come from (colours, sizes, packaging types). Items refer to them by name
 * and never create one, so a typo in an items file cannot mint a new colour: new names come in here first.
 * A row is matched by id, else by name; a new name is added, a known id can be renamed; nothing is deleted.
 */
final class OptionNamesDataset extends Dataset
{
    /** @param class-string<Model> $model */
    public function __construct(
        private readonly string $key,
        private readonly string $label,
        private readonly string $model,
        private readonly string $example,
    ) {
    }

    public function key(): string
    {
        return $this->key;
    }

    public function label(): string
    {
        return $this->label;
    }

    public function group(): string
    {
        return 'Items';
    }

    public function description(): string
    {
        return "The {$this->label} items can be made in. Importing adds new names and renames by id; it never deletes.";
    }

    public function columns(): array
    {
        return ['id', 'name'];
    }

    public function required(): array
    {
        return ['name'];
    }

    public function example(): array
    {
        return ['', $this->example];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        foreach ($this->model::query()->orderBy('name')->cursor() as $row) {
            yield [$row->id, $row->name];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $have = array_flip($table->header);
        $byName = $this->model::query()->get(['id', 'name'])->keyBy(fn (Model $m): string => mb_strtolower((string) $m->name));
        $byId = $byName->keyBy('id');
        $seenIds = [];
        $seenNames = [];

        foreach ($table->rows as $row) {
            $name = $row['data']['name'];
            if ($name === '') {
                $table->error('name is empty', $row['line']);

                continue;
            }
            if (mb_strlen($name) > 255) {
                $table->error('name is longer than 255 characters', $row['line']);

                continue;
            }

            $id = isset($have['id']) ? $table->int($row, 'id') : null;
            $existing = $id !== null ? $byId->get($id) : $byName->get(mb_strtolower($name));
            if ($id !== null && $existing === null) {
                $table->error("there is no {$this->label} with id {$id}", $row['line']);

                continue;
            }

            $clash = $byName->get(mb_strtolower($name));
            if ($existing !== null && $clash !== null && $clash->id !== $existing->id) {
                $table->error("'{$name}' is already the name of another ({$clash->id})", $row['line']);

                continue;
            }
            if (isset($seenNames[mb_strtolower($name)])) {
                $table->error("'{$name}' is already on line {$seenNames[mb_strtolower($name)]}", $row['line']);

                continue;
            }
            $seenNames[mb_strtolower($name)] = $row['line'];
            if ($existing !== null) {
                if (isset($seenIds[$existing->id])) {
                    $table->error("id {$existing->id} is already on line {$seenIds[$existing->id]}", $row['line']);

                    continue;
                }
                $seenIds[$existing->id] = $row['line'];
            }

            // Found by its name alone, so only the case could differ: that is not a rename.
            if ($id === null && $existing !== null) {
                $plan->same();

                continue;
            }

            $this->queue($plan, $name, $existing, ['name' => $name], function () use ($existing, $name): int {
                if ($existing !== null) {
                    $existing->update(['name' => $name]);

                    return (int) $existing->id;
                }

                return (int) $this->model::query()->create(['name' => $name])->id;
            });
        }

        return $plan;
    }
}
