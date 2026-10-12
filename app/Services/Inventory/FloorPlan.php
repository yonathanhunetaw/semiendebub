<?php

declare(strict_types=1);

namespace App\Services\Inventory;

use App\Models\Auth\User;
use App\Models\Inventory\FloorArea;
use App\Models\Inventory\StockLocation;
use App\Models\Item\Item;
use Illuminate\Support\Collection;
use InvalidArgumentException;

/**
 * A hub's floor plan: the floor in metres (e.g. 10 × 30 or 15 × 15), areas
 * drawn on it, and which items sit in each area, so a keeper can walk to
 * an item.
 *
 * Volume: the location's CBM capacity is set by hand (LocationLevels); an
 * item's CBM is not set, it follows from its stock (quantity × the CBM of its
 * packaging). An area shows the CBM of the items placed in it; an item in
 * several areas is shared out evenly between them.
 */
class FloorPlan
{
    public function __construct(private readonly LocationLevels $levels)
    {
    }

    /** @return array<string, mixed> */
    public function forLocation(StockLocation $location): array
    {
        $board = $this->levels->forLocation($location);
        $rows = collect($board['items'])->keyBy('item_id');

        $areas = FloorArea::query()
            ->where('stock_location_id', $location->id)
            ->with('items:id')
            ->orderBy('code')
            ->get();

        // How many areas each item is spread over, to share its CBM.
        $spread = $areas->flatMap(fn (FloorArea $a) => $a->items->pluck('id'))->countBy();

        $presented = $areas->map(function (FloorArea $area) use ($rows, $spread): array {
            $items = $area->items
                ->map(function (Item $item) use ($rows, $spread): array {
                    $row = $rows->get($item->id);
                    $share = max(1, (int) ($spread[$item->id] ?? 1));

                    return [
                        'item_id' => (int) $item->id,
                        'name' => (string) ($row['name'] ?? $item->product_name),
                        'image' => $row['image'] ?? null,
                        'display' => $row['display'] ?? 'None here',
                        'status' => $row['status'] ?? 'empty',
                        'cbm' => round(((float) ($row['cbm'] ?? 0)) / $share, 3),
                        'shared' => $share > 1,
                    ];
                })
                ->sortBy('name')
                ->values();

            return [
                'id' => (int) $area->id,
                'code' => (string) $area->code,
                'name' => $area->name,
                'kind' => (string) $area->kind,
                'x' => (float) $area->x_m,
                'y' => (float) $area->y_m,
                'width' => (float) $area->width_m,
                'length' => (float) $area->length_m,
                'area_m2' => round($area->width_m * $area->length_m, 2),
                'notes' => $area->notes,
                'cbm' => round((float) $items->sum('cbm'), 2),
                'items' => $items->all(),
            ];
        });

        $placed = $spread->keys()->map(fn ($id): int => (int) $id)->all();
        $unplaced = $rows->reject(fn (array $row): bool => in_array($row['item_id'], $placed, true))
            ->map(fn (array $row): array => array_intersect_key($row, array_flip(['item_id', 'name', 'image', 'display', 'status', 'cbm', 'skus'])))
            ->sortBy('name')
            ->values();

        return [
            'location' => $board['location'],
            'floor' => [
                'width' => $location->floor_width_m,
                'length' => $location->floor_length_m,
                'area_m2' => $location->floor_width_m && $location->floor_length_m
                    ? round($location->floor_width_m * $location->floor_length_m, 2)
                    : null,
            ],
            'capacity' => $board['capacity'],
            'areas' => $presented->values()->all(),
            'unplaced' => $unplaced->all(),
            'items' => $rows->map(fn (array $row): array => ['item_id' => $row['item_id'], 'name' => $row['name'], 'display' => $row['display']])->sortBy('name')->values()->all(),
            'kinds' => FloorArea::KINDS,
        ];
    }

    public function setSize(StockLocation $location, float $width, float $length): void
    {
        $this->assertServed($location);

        if ($width <= 0 || $length <= 0) {
            throw new InvalidArgumentException('A floor needs a width and a length.');
        }

        $outside = FloorArea::query()->where('stock_location_id', $location->id)->get()
            ->first(fn (FloorArea $a): bool => $a->x_m + $a->width_m > $width + 0.001 || $a->y_m + $a->length_m > $length + 0.001);

        if ($outside !== null) {
            throw new InvalidArgumentException("Area {$outside->code} would fall outside a {$width} × {$length} m floor. Move or shrink it first.");
        }

        $location->forceFill(['floor_width_m' => $width, 'floor_length_m' => $length])->save();
    }

    /** @param array<string, mixed> $data code, name, kind, x, y, width, length, notes */
    public function saveArea(StockLocation $location, array $data, ?FloorArea $area = null): FloorArea
    {
        $this->assertServed($location);

        if (! $location->floor_width_m || ! $location->floor_length_m) {
            throw new InvalidArgumentException('Set the floor size first.');
        }

        $x = (float) $data['x'];
        $y = (float) $data['y'];
        $w = (float) $data['width'];
        $l = (float) $data['length'];

        if ($w <= 0 || $l <= 0 || $x < 0 || $y < 0) {
            throw new InvalidArgumentException('An area needs a positive size and a place on the floor.');
        }

        if ($x + $w > $location->floor_width_m + 0.001 || $y + $l > $location->floor_length_m + 0.001) {
            throw new InvalidArgumentException("That area runs off the {$location->floor_width_m} × {$location->floor_length_m} m floor.");
        }

        $overlap = FloorArea::query()
            ->where('stock_location_id', $location->id)
            ->when($area !== null, fn ($q) => $q->where('id', '!=', $area->id))
            ->get()
            ->first(fn (FloorArea $o): bool => $x < $o->x_m + $o->width_m - 0.001 && $o->x_m < $x + $w - 0.001
                && $y < $o->y_m + $o->length_m - 0.001 && $o->y_m < $y + $l - 0.001);

        if ($overlap !== null) {
            throw new InvalidArgumentException("That area overlaps {$overlap->code}.");
        }

        $code = strtoupper(trim((string) $data['code']));
        $taken = FloorArea::query()->where('stock_location_id', $location->id)->where('code', $code)
            ->when($area !== null, fn ($q) => $q->where('id', '!=', $area->id))->exists();

        if ($taken) {
            throw new InvalidArgumentException("There is already an area {$code} here.");
        }

        $attributes = [
            'stock_location_id' => $location->id,
            'code' => $code,
            'name' => $data['name'] ?? null,
            'kind' => in_array($data['kind'] ?? 'storage', FloorArea::KINDS, true) ? $data['kind'] : 'storage',
            'x_m' => $x,
            'y_m' => $y,
            'width_m' => $w,
            'length_m' => $l,
            'notes' => $data['notes'] ?? null,
        ];

        if ($area === null) {
            return FloorArea::query()->create($attributes);
        }

        $area->update($attributes);

        return $area->refresh();
    }

    public function place(FloorArea $area, Item $item, ?User $by = null): void
    {
        $area->items()->syncWithoutDetaching([$item->id => ['placed_by' => $by?->id]]);
    }

    public function unplace(FloorArea $area, Item $item): void
    {
        $area->items()->detach($item->id);
    }

    /**
     * The areas an item sits in at each location.
     *
     * @return Collection<int, array{location_id: int, code: string, name: ?string}>
     */
    public function areasOf(int $itemId): Collection
    {
        return FloorArea::query()
            ->whereHas('items', fn ($q) => $q->where('items.id', $itemId))
            ->get()
            ->map(fn (FloorArea $a): array => ['location_id' => (int) $a->stock_location_id, 'code' => (string) $a->code, 'name' => $a->name]);
    }

    private function assertServed(StockLocation $location): void
    {
        if (! $this->levels->serves($location)) {
            throw new InvalidArgumentException("{$location->name} has no floor plan; floor plans are for hubs and store floors.");
        }
    }
}
