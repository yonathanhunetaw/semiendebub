<?php

namespace Database\Factories;

use App\Models\Item\Item;
use App\Models\Item\ItemColor;
use App\Models\Item\ItemSize;
use App\Models\Item\ItemPackagingType;
use App\Models\Item\ItemVariant;
use App\Models\Auth\User;
use App\Services\ImageResolver;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Log;

/**
 * ItemVariantFactory
 *
 * SEEDING STRATEGY
 * ─────────────────
 * Like ItemFactory, this downloads a picsum image and stores the MinIO key.
 * The "images" column holds raw keys — never URLs.
 *
 * HOW TO KEEP SEEDED VARIANTS IN SYNC
 * ─────────────────────────────────────
 * When you edit a variant via the admin UI and save new images:
 *   1. Note the variant's SKU and the MinIO key paths shown in the Show page.
 *   2. Use ->withPicsumId(N) to pin the same visual, or ->withLocalImages([...])
 *      to use files committed under storage/app/seed-images/.
 *
 * Example:
 *   ItemVariant::factory()
 *       ->for($item)
 *       ->withPicsumId(442)          // always the same image on reseed
 *       ->create([
 *           'item_color_id' => $redColor->id,
 *           'item_size_id'  => $largeSize->id,
 *       ]);
 */
class ItemVariantFactory extends Factory
{
    protected $model = ItemVariant::class;

    protected int $picsumId = 0;
    protected array $localImages = [];

    public function definition(): array
    {
        return [
            'item_id'                => Item::factory(),
            'item_color_id'          => ItemColor::factory(),
            'item_size_id'           => ItemSize::factory(),
            'item_packaging_type_id' => ItemPackagingType::factory(),
            'owner_id'               => User::factory(),
            'status'                 => 'active',
            'packaging_total_pieces' => 1,
            'barcode'                => $this->faker->ean13(),
            'images'                 => [], // Filled in configure() after model has an ID/SKU
            'sku'                    => null, // booted() hook generates this
        ];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (ItemVariant $variant) {
            $keys = [];

            if (!empty($this->localImages)) {
                foreach ($this->localImages as $index => $filename) {
                    $localPath = storage_path('app/seed-images/' . $filename);
                    $sku = $variant->sku ?? $variant->id;
                    $key = "uploads/variants/{$sku}/img-{$index}.jpg";
                    try {
                        $keys[] = ImageResolver::uploadSeedImage($localPath, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemVariantFactory: could not upload local image [{$filename}]: " . $e->getMessage());
                    }
                }
            } else {
                $seedId = $this->picsumId > 0 ? $this->picsumId : ($variant->id + 200);
                $sku    = $variant->sku ?? $variant->id;

                // Two images per variant (min needed for proof_ok gate in the UI)
                $offsets = [0, 20];
                foreach ($offsets as $i => $offset) {
                    $id  = (($seedId + $offset) % 1000) ?: 1;
                    $url = "https://picsum.photos/id/{$id}/600/600";
                    $key = "uploads/variants/{$sku}/img-{$i}.jpg";
                    try {
                        $keys[] = ImageResolver::uploadFromUrl($url, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemVariantFactory: could not upload picsum image [{$url}]: " . $e->getMessage());
                    }
                }
            }

            if (!empty($keys)) {
                $variant->update(['images' => $keys]);
            }
        });
    }

    public function withPicsumId(int $id): static
    {
        $clone = clone $this;
        $clone->picsumId = $id;
        return $clone;
    }

    public function withLocalImages(array $filenames): static
    {
        $clone = clone $this;
        $clone->localImages = $filenames;
        return $clone;
    }
}
