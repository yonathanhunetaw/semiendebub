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

class ItemVariantFactory extends Factory
{
    protected $model = ItemVariant::class;

    // Optional overrides — set via ->withPicsumId(N) or ->withLocalImages([...])
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
            'images'                 => [],

            // Leave 'sku' null so the booted() hook auto-generates it after insert.
            // If you set it here, booted() will skip generation (it checks !$variant->sku).
            'sku'                    => null,
        ];
    }

    /**
     * After the variant is created (and the booted() hook has set the SKU),
     * upload placeholder images to MinIO and store the raw keys in 'images'.
     *
     * Two images are uploaded per variant — the minimum needed to pass the
     * proof_ok gate in the admin UI (slot_count >= 2).
     */
    public function configure(): static
    {
        return $this->afterCreating(function (ItemVariant $variant) {
            $keys = [];
            // Use the generated SKU as the folder name so paths are meaningful
            $sku = $variant->sku ?? $variant->id;

            if (!empty($this->localImages)) {
                // Upload files committed to storage/app/seed-images/
                foreach ($this->localImages as $index => $filename) {
                    $localPath = storage_path('app/seed-images/' . $filename);
                    $key = "uploads/variants/{$sku}/img-{$index}.jpg";
                    try {
                        $keys[] = ImageResolver::uploadSeedImage($localPath, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemVariantFactory: could not upload [{$filename}]: " . $e->getMessage());
                    }
                }
            } else {
                // Download from picsum.photos — deterministic when picsumId is pinned
                $seedId = $this->picsumId > 0 ? $this->picsumId : ($variant->id + 200);

                foreach ([0, 20] as $i => $offset) {
                    $id  = (($seedId + $offset) % 1000) ?: 1;
                    $url = "https://picsum.photos/id/{$id}/600/600";
                    $key = "uploads/variants/{$sku}/img-{$i}.jpg";
                    try {
                        $keys[] = ImageResolver::uploadFromUrl($url, $key);
                    } catch (\Throwable $e) {
                        Log::warning("ItemVariantFactory: could not upload from [{$url}]: " . $e->getMessage());
                    }
                }
            }

            if (!empty($keys)) {
                $variant->update(['images' => $keys]);
            }
        });
    }

    /**
     * Pin a specific picsum image so every reseed produces the same photo.
     *
     * Usage: ItemVariant::factory()->withPicsumId(442)->create([...]);
     */
    public function withPicsumId(int $id): static
    {
        $clone = clone $this;
        $clone->picsumId = $id;
        return $clone;
    }

    /**
     * Use files committed under storage/app/seed-images/ instead of downloading.
     *
     * Usage: ItemVariant::factory()->withLocalImages(['red-front.jpg', 'red-back.jpg'])->create([...]);
     */
    public function withLocalImages(array $filenames): static
    {
        $clone = clone $this;
        $clone->localImages = $filenames;
        return $clone;
    }
}
