<?php

declare(strict_types=1);

namespace App\Console\Commands\Inventory;

use App\Models\Item\Item;
use App\Services\Item\ItemReadiness;
use Illuminate\Console\Command;

/**
 * Works out every item's readiness percentage (ItemReadiness) and remembers it on the item, so the
 * item list can show and filter by it. The item setup page refreshes the one item it shows; this catches
 * what changed elsewhere (a count approved in Admin → Counts, a shelf bin set by a manager). Reads data,
 * writes only items.readiness_percent.
 */
final class RefreshItemReadinessCommand extends Command
{
    /** @var string */
    protected $signature = 'items:refresh-readiness';

    /** @var string */
    protected $description = 'Work out every item\'s readiness percentage and store it (for the item list)';

    public function handle(ItemReadiness $readiness): int
    {
        $done = 0;
        $ready = 0;

        Item::query()->orderBy('id')->chunkById(100, function ($items) use ($readiness, &$done, &$ready): void {
            foreach ($items as $item) {
                $percent = $readiness->refresh($item)['percent'];
                $done++;
                $ready += $percent >= 100 ? 1 : 0;
            }
        });

        $this->components->info("Readiness refreshed for {$done} items ({$ready} fully ready).");

        return self::SUCCESS;
    }
}
