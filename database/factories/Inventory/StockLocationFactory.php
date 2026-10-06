<?php

declare(strict_types=1);

namespace Database\Factories\Inventory;

use App\Models\Inventory\StockLocation;
use App\Models\Store\Store;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<StockLocation>
 */
class StockLocationFactory extends Factory
{
    protected $model = StockLocation::class;

    public function definition(): array
    {
        return [
            'parent_id' => null,
            'kind' => StockLocation::KIND_MAIN_HUB,
            'name' => $this->faker->unique()->city().' Hub',
            'code' => 'LOC-'.strtoupper($this->faker->unique()->bothify('???###')),
            'address' => $this->faker->streetAddress(),
            'status' => 'active',
            'store_id' => null,
            'is_stockable' => true,
        ];
    }

    public function mainHub(): static
    {
        return $this->state(fn (): array => [
            'kind' => StockLocation::KIND_MAIN_HUB,
            'store_id' => null,
            'parent_id' => null,
            'is_stockable' => true,
        ]);
    }

    /** A leaf under the given store's group node. */
    public function under(StockLocation $storeNode, string $kind): static
    {
        return $this->state(fn (): array => [
            'kind' => $kind,
            'parent_id' => $storeNode->id,
            'store_id' => $storeNode->store_id,
            'is_stockable' => StockLocation::isStockableKind($kind),
        ]);
    }

    /** A remote hub for a store, which must already have its group node. */
    public function remoteHubFor(Store $store): static
    {
        return $this->state(function () use ($store): array {
            $node = StockLocation::query()
                ->where('store_id', $store->id)
                ->where('kind', StockLocation::KIND_STORE)
                ->firstOrFail();

            return [
                'kind' => StockLocation::KIND_REMOTE_HUB,
                'name' => 'Remote Hub',
                'parent_id' => $node->id,
                'store_id' => $store->id,
                'is_stockable' => true,
            ];
        });
    }
}
