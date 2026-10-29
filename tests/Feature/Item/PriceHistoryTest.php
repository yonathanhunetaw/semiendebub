<?php

declare(strict_types=1);

namespace Tests\Feature\Item;

use App\Models\Item\Item;
use App\Models\Item\ItemVariant;
use App\Models\Store\PriceChange;
use App\Models\Store\Store;
use App\Models\Store\StoreVariant;
use App\Services\Item\PriceHistory;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The catalogue's price history: every real change is kept, and the price on
 * any day can be read back.
 */
class PriceHistoryTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function every_real_price_change_is_kept_and_the_price_on_a_day_can_be_read_back(): void
    {
        config(['app.business_timezone' => 'Africa/Addis_Ababa']);
        $store = Store::factory()->create();
        $item = Item::factory()->create();
        $variant = ItemVariant::factory()->create(['item_id' => $item->id]);

        $this->travelTo(CarbonImmutable::parse('2026-10-01 10:00', 'Africa/Addis_Ababa')->utc());
        $sv = StoreVariant::factory()->create(['store_id' => $store->id, 'item_id' => $item->id, 'item_variant_id' => $variant->id, 'pricing_matrix' => ['price' => 100]]);

        $this->travelTo(CarbonImmutable::parse('2026-10-10 10:00', 'Africa/Addis_Ababa')->utc());
        $sv->update(['pricing_matrix' => ['price' => 120]]);
        $sv->update(['pricing_matrix' => ['price' => 120]]); // no change: not recorded
        $sv->update(['active' => true]); // another column: not recorded

        $changes = PriceChange::query()->where('store_variant_id', $sv->id)->orderBy('id')->get();
        $this->assertCount(2, $changes);
        $this->assertNull($changes[0]->old_price);
        $this->assertSame(100.0, (float) $changes[0]->new_price);
        $this->assertSame(100.0, (float) $changes[1]->old_price);
        $this->assertSame(120.0, (float) $changes[1]->new_price);
        $this->assertSame((int) $store->id, $changes[1]->store_id);

        $history = app(PriceHistory::class);
        $this->assertSame(100.0, $history->storePriceOn($sv->id, '2026-10-05'));
        $this->assertSame(120.0, $history->storePriceOn($sv->id, '2026-10-10'));
        $this->assertNull($history->storePriceOn($sv->id, '2026-09-30'));

        $rows = $history->forItem((int) $item->id, null);
        $this->assertSame([120.0, 100.0], array_column($rows, 'new_price'), 'Newest first.');
        $this->assertSame([], $history->forItem((int) $item->id, [0]), 'Scoped to the stores asked for.');
    }
}
