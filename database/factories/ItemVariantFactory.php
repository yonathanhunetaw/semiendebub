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
            'barcode'                => $this->faker->ean13(),
            'images'                 => [],

            // Leave 'sku' null so the booted() hook auto-generates it after insert.
            // If you set it here, booted() will skip generation (it checks !$variant->sku).
            'sku'                    => null,
        ];
    }

    /**
     * Upload only images explicitly asked for via ->withLocalImages().
     *
     * This used to fall back to downloading two photos per variant from
     * picsum.photos. That made seeding depend on the network, took a round
     * trip per variant across a 1,600-variant catalogue, and on failure logged
     * a warning and carried on — so a seed run could half-succeed without
     * saying so.
     *
     * A variant with no photography is now a supported, rendered state: the UI
     * draws a PackagingPlaceholder from the variant's packaging type. Pass
     * ->withLocalImages([...]) when a specific variant needs real pictures.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (ItemVariant $variant) {
            if (empty($this->localImages)) {
                return;
            }

            $keys = [];
            // Use the generated SKU as the folder name so paths are meaningful
            $sku = $variant->sku ?? $variant->id;

            foreach ($this->localImages as $index => $filename) {
                $localPath = storage_path('app/seed-images/' . $filename);
                $key = "uploads/variants/{$sku}/img-{$index}.jpg";

                try {
                    // Records the key only on a successful upload, so the
                    // column never names an object that is not there.
                    $keys[] = ImageResolver::uploadSeedImage($localPath, $key);
                } catch (\Throwable $e) {
                    Log::warning("ItemVariantFactory: could not upload [{$filename}]: " . $e->getMessage());
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
