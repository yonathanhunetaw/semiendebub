<?php

namespace Database\Factories\Item;

use App\Models\Item\Item;
use App\Models\Item\ItemCategory;
use App\Services\ImageResolver;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Log;

/**
 * ItemFactory
 *
 * SEEDING STRATEGY
 * ─────────────────
 * We download a real placeholder image from picsum.photos and upload it to
 * MinIO during factory creation. The DB column stores the raw MinIO key
 * (e.g. "uploads/items/{id}/cover.jpg"), NOT a URL.
 *
 * This means after every `migrate:fresh --seed` the images actually exist
 * in MinIO and are served correctly.
 *
 * HOW TO KEEP SEEDED DATA IN SYNC
 * ────────────────────────────────
 * When you edit an item via the admin UI and save new images, the controller
 * stores the new MinIO keys in general_images. To bake those into the seeder:
 *
 *   1. Note the item's ID and the new keys shown in the admin Show page.
 *   2. In your ItemSeeder (or DatabaseSeeder), call Item::factory()->withImages([...])
 *      passing the local seed image filenames, OR switch to ImageResolver::uploadFromUrl()
 *      with a specific picsum seed ID so you always get the same image.
 *
 * Example — pin a specific picsum image per item so reseed is idempotent:
 *
 *   Item::factory()->withPicsumId(237)->create(['product_name' => 'Red Widget']);
 */
class ItemFactory extends Factory
{
    protected $model = Item::class;

    /** Picsum seed ID — override via ->withPicsumId(N) */
    protected int $picsumId = 0;

    /** Local seed image paths — override via ->withLocalImages([...]) */
    protected array $localImages = [];

    public function definition(): array
    {
        return [
            'product_name'        => $this->faker->words(3, true),
            'product_description' => $this->faker->paragraph(),
            'packaging_details'   => $this->faker->sentence(),
            'general_images'      => [], // Filled in configure() after model has an ID
            'status'              => 'active',
            'is_incomplete'       => false,
            'item_category_id'    => ItemCategory::firstOrCreate(
                ['category_name' => 'General']
            )->id,
        ];
    }

    /**
     * After the model is created, upload placeholder images to MinIO.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (Item $item) {
            $keys = [];

            if (!empty($this->localImages)) {
                // Upload committed seed images from storage/app/seed-images/
                foreach ($this->localImages as $index => $filename) {
                    $localPath = storage_path('app/seed-images/' . $filename);
                    $key = "uploads/items/{$item->id}/img-{$index}.jpg";
                    try {
                        $keys[] = ImageResolver::uploadSeedImage($localPath, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemFactory: could not upload local seed image [{$filename}]: " . $e->getMessage());
                    }
                }
            } else {
                // Download from picsum.photos — deterministic when picsumId is set
                $seedId = $this->picsumId > 0 ? $this->picsumId : $item->id;

                // Two images per item (front + lifestyle)
                $offsets = [0, 10];
                foreach ($offsets as $i => $offset) {
                    $id  = (($seedId + $offset) % 1000) ?: 1; // Wrap to valid range
                    $url = "https://picsum.photos/id/{$id}/600/600";
                    $key = "uploads/items/{$item->id}/img-{$i}.jpg";

                    try {
                        $keys[] = ImageResolver::uploadFromUrl($url, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemFactory: could not upload picsum image [{$url}]: " . $e->getMessage());
                    }
                }
            }

            if (!empty($keys)) {
                $item->update(['general_images' => $keys]);
            }
        });
    }

    /**
     * Pin a specific picsum seed so reseed always produces the same image.
     *
     * Usage: Item::factory()->withPicsumId(237)->create([...]);
     */
    public function withPicsumId(int $id): static
    {
        $clone = clone $this;
        $clone->picsumId = $id;
        return $clone;
    }

    /**
     * Use committed local seed images instead of downloading.
     *
     * Usage: Item::factory()->withLocalImages(['widget-front.jpg', 'widget-back.jpg'])->create([...]);
     * Files must exist at: storage/app/seed-images/{filename}
     */
    public function withLocalImages(array $filenames): static
    {
        $clone = clone $this;
        $clone->localImages = $filenames;
        return $clone;
    }
}
