<?php

declare(strict_types=1);

namespace App\Services\DataExchange\Datasets;

use App\Models\Auth\User;
use App\Models\Item\ItemCategory;
use App\Services\DataExchange\CategoryPaths;
use App\Services\DataExchange\Dataset;
use App\Services\DataExchange\ImportPlan;
use App\Services\Shared\CsvTable;

/** Item categories as paths ("Bags > School bags"), up to 4 deep. New paths are created; nothing is renamed or deleted. */
final class CategoriesDataset extends Dataset
{
    public function key(): string
    {
        return 'categories';
    }

    public function label(): string
    {
        return 'Item categories';
    }

    public function group(): string
    {
        return 'Items';
    }

    public function description(): string
    {
        return 'The category tree, one path per row like "Bags > School bags". Importing adds missing categories; it never renames or deletes.';
    }

    public function columns(): array
    {
        return ['id', 'path', 'items'];
    }

    public function required(): array
    {
        return ['path'];
    }

    public function example(): array
    {
        return ['', 'Bags > School bags', ''];
    }

    public function importable(): bool
    {
        return true;
    }

    public function rows(): iterable
    {
        $all = ItemCategory::query()->withCount('items')->orderBy('id')->get();
        $byId = $all->keyBy('id');
        $path = function (ItemCategory $c) use ($byId): string {
            $names = [];
            for ($guard = 0; $c !== null && $guard < 10; $guard++) {
                array_unshift($names, $c->category_name);
                $c = $c->parent_id !== null ? $byId->get($c->parent_id) : null;
            }

            return implode(' > ', $names);
        };

        foreach ($all->sortBy(fn (ItemCategory $c): string => mb_strtolower($path($c))) as $c) {
            yield [$c->id, $path($c), $c->items_count];
        }
    }

    public function plan(CsvTable $table, User $by, array $options = []): ImportPlan
    {
        $plan = new ImportPlan();
        $paths = new CategoryPaths();

        foreach ($table->rows as $row) {
            $segments = $paths->segments($row['data']['path']);
            if ($segments === null) {
                $table->error("path '{$row['data']['path']}' must look like 'Parent > Child' (1 to ".CategoryPaths::MAX_DEPTH.' levels)', $row['line']);

                continue;
            }
            $paths->ensure($segments);
        }

        // Writes run in order, so a parent is always made before its children.
        $paths->queueCreates($plan);
        if (! $paths->hasCreates() && $table->rows !== []) {
            $plan->same(count($table->rows));
        }

        return $plan;
    }
}
