<?php

declare(strict_types=1);

namespace App\Services\DataExchange;

use App\Models\Item\ItemCategory;

/**
 * The category tree as "Parent > Child" paths (1 to 4 levels, names compared without regard to case).
 * lookup() only finds what exists; ensure() also notes the categories a path would add, with negative
 * placeholder ids, and queueCreates() turns those into writes (parents always before their children).
 */
final class CategoryPaths
{
    public const MAX_DEPTH = 4;

    /** @var array<int, array<string, int>> parent id (0 = top level) => lower-case name => id */
    private array $tree = [];

    private int $placeholder = 0;

    /** @var array<int, array{name: string, parent: int, path: string}> placeholder id => what to create */
    private array $created = [];

    /** @var array<int, array{name: string, parent: int}> id => name and parent id (0 = top level), for pathFor() */
    private array $nodes = [];

    public function __construct()
    {
        foreach (ItemCategory::query()->get(['id', 'category_name', 'parent_id']) as $c) {
            $this->tree[(int) $c->parent_id][mb_strtolower($c->category_name)] = (int) $c->id;
            $this->nodes[(int) $c->id] = ['name' => (string) $c->category_name, 'parent' => (int) $c->parent_id];
        }
    }

    /** The "Parent > Child" path of an existing category; empty for an unknown id. */
    public function pathFor(?int $id): string
    {
        $names = [];
        for ($guard = 0; $id !== null && $id !== 0 && isset($this->nodes[$id]) && $guard < 10; $guard++) {
            array_unshift($names, $this->nodes[$id]['name']);
            $id = $this->nodes[$id]['parent'];
        }

        return implode(' > ', $names);
    }

    /** @return list<string>|null the names of a path, or null when it is not 1 to 4 non-empty names */
    public function segments(string $path): ?array
    {
        $segments = array_map('trim', explode('>', $path));

        return in_array('', $segments, true) || count($segments) > self::MAX_DEPTH ? null : $segments;
    }

    /** The id of an existing category, or null when any step of the path is missing. */
    public function lookup(string $path): ?int
    {
        $segments = $this->segments($path);
        if ($segments === null) {
            return null;
        }

        $parent = 0;
        foreach ($segments as $name) {
            $id = $this->tree[$parent][mb_strtolower($name)] ?? null;
            if ($id === null) {
                return null;
            }
            $parent = $id;
        }

        return $parent;
    }

    /**
     * The id of a path, noting each missing step as a category to create (id < 0 until it is made).
     *
     * @param  list<string>  $segments
     */
    public function ensure(array $segments): int
    {
        $parent = 0;
        $walked = [];
        foreach ($segments as $name) {
            $walked[] = $name;
            $id = $this->tree[$parent][mb_strtolower($name)] ?? null;
            if ($id === null) {
                $id = --$this->placeholder;
                $this->tree[$parent][mb_strtolower($name)] = $id;
                $this->created[$id] = ['name' => $name, 'parent' => $parent, 'path' => implode(' > ', $walked)];
            }
            $parent = $id;
        }

        return $parent;
    }

    public function hasCreates(): bool
    {
        return $this->created !== [];
    }

    /** Adds one create per new category to the plan. Their real ids are known once the writes have run. */
    public function queueCreates(ImportPlan $plan): void
    {
        $real = [];
        foreach ($this->created as $placeholderId => $info) {
            $plan->add('create', $info['path'], function () use ($info, $placeholderId, &$real): int {
                $parentId = $info['parent'] === 0 ? null : ($info['parent'] > 0 ? $info['parent'] : $real[$info['parent']]);

                return $real[$placeholderId] = ItemCategory::query()->create(['category_name' => $info['name'], 'parent_id' => $parentId])->id;
            });
        }
    }
}
