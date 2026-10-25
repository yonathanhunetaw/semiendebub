<?php

declare(strict_types=1);

namespace App\Services\DataExchange;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\Item\ItemDeployer;
use App\Services\Shared\CsvReader;

/**
 * Puts items in a store: one store variant per variant that has none there yet, through ItemDeployer, so
 * they arrive switched off and with no price (a price is what puts a variant on sale). Either every item
 * that is not fully in the store yet, or just the items named in a file of item ids. Archived items are skipped.
 */
final class DeployTool
{
    public const MAX_ITEMS = 1000;

    public function __construct(private readonly ItemDeployer $deployer, private readonly CsvReader $reader)
    {
    }

    /**
     * @param  string  $scope  "missing" (every item not fully in the store) or "file" (the item_id column of $csv)
     * @return array{0: ImportPlan, 1: list<string>} the plan, and the problems that stop it
     */
    public function plan(Store $store, string $scope, ?string $csv): array
    {
        $plan = new ImportPlan();
        $notThere = fn ($variants) => $variants->whereDoesntHave('storeVariants', fn ($q) => $q->where('store_id', $store->id));

        if ($scope === 'file') {
            $table = $this->reader->parse((string) $csv, ['item_id'], [], ['item_id'], self::MAX_ITEMS);
            $items = collect();
            if ($table->ok()) {
                $ids = array_values(array_filter(array_map(fn (array $row): ?int => $table->int($row, 'item_id', true), $table->rows)));
                $items = Item::query()->whereIn('id', $ids)->get()->keyBy('id');
                foreach ($table->rows as $row) {
                    $id = (int) $row['data']['item_id'];
                    if ($id > 0 && ! $items->has($id)) {
                        $table->error("there is no item {$id}", $row['line']);
                    }
                }
            }
            if (! $table->ok()) {
                return [$plan, $table->errors()];
            }
            $items = $items->values();
        } else {
            $items = Item::query()->where('status', '!=', 'archived')
                ->whereHas('variants', fn ($q) => $notThere($q))
                ->orderBy('id')->get();
        }

        $total = 0;
        foreach ($items as $item) {
            if ($item->status === 'archived') {
                $plan->warn("'{$item->product_name}' is archived and was skipped");

                continue;
            }
            $missing = $notThere(ItemVariant::query()->where('item_id', $item->id))->count();
            if ($missing === 0) {
                $plan->same();

                continue;
            }
            $total += $missing;
            $plan->add('create', "{$item->product_name}: {$missing} ".($missing === 1 ? 'variant' : 'variants'), fn (): int => $this->deployer->deploy($item, $store));
        }

        if ($total > 0) {
            $plan->warn("{$total} store variants will be created in {$store->name}, switched off and with no price: set prices to put them on sale");
        }

        return [$plan, []];
    }
}
