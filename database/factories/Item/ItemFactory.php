<?php

namespace Database\Factories\Item;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Services\ImageResolver;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Log;

class ItemFactory extends Factory
{
    protected $model = Item::class;

    /** Picsum seed ID — override via ->withPicsumId(N) */
    protected int $picsumId = 0;

    /** Local seed image filenames — override via ->withLocalImages([...]) */
    protected array $localImages = [];

    /**
     * definition() preserved exactly from your original.
     * general_images starts empty — configure() fills it after the model has an ID.
     */
    public function definition(): array
    {
        return [
            'product_name'        => $this->faker->words(3, true),
            'product_description' => $this->faker->paragraph(),
            'packaging_details'   => $this->faker->sentence(),
            'general_images'      => [],   // was json_encode(["https://via.placeholder.com/150"])
            'status'              => 'active',
            'is_incomplete'       => false,
            'item_category_id'    => ItemCategory::firstOrCreate(
                ['category_name' => 'General']
            )->id,

            // REMOVED: 'price', 'sku' — these don't exist on the items table.
        ];
    }

    /**
     * ADDED: After the model is created, upload placeholder images to MinIO
     * and store the raw keys in general_images.
     * This makes migrate:fresh --seed produce real images, not placeholder URLs.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (Item $item) {
            $keys = [];

            if (!empty($this->localImages)) {
                // Use files committed to storage/app/seed-images/
                foreach ($this->localImages as $index => $filename) {
                    $localPath = storage_path('app/seed-images/' . $filename);
                    $key = "uploads/items/{$item->id}/img-{$index}.jpg";
                    try {
                        $keys[] = ImageResolver::uploadSeedImage($localPath, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemFactory: could not upload [{$filename}]: " . $e->getMessage());
                    }
                }
            } else {
                // Download from picsum.photos — use a pinned ID for idempotent reseeds
                $seedId = $this->picsumId > 0 ? $this->picsumId : $item->id;

                foreach ([0, 10] as $i => $offset) {
                    $id  = (($seedId + $offset) % 1000) ?: 1;
                    $url = "https://picsum.photos/id/{$id}/600/600";
                    $key = "uploads/items/{$item->id}/img-{$i}.jpg";
                    try {
                        $keys[] = ImageResolver::uploadFromUrl($url, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemFactory: could not download [{$url}]: " . $e->getMessage());
                    }
                }
            }

            if (!empty($keys)) {
                $item->update(['general_images' => $keys]);
            }
        });
    }

    /**
     * Pin a specific picsum ID so the same image is fetched on every reseed.
     * Usage: Item::factory()->withPicsumId(237)->create([...])
     */
    public function withPicsumId(int $id): static
    {
        $clone = clone $this;
        $clone->picsumId = $id;
        return $clone;
    }

    /**
     * Use files committed to storage/app/seed-images/ instead of downloading.
     * Usage: Item::factory()->withLocalImages(['front.jpg', 'back.jpg'])->create([...])
     */
    public function withLocalImages(array $filenames): static
    {
        $clone = clone $this;
        $clone->localImages = $filenames;
        return $clone;
    }
}
