<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;

class ItemImageSeeder extends Seeder
{
    public function run(): void
    {
        // Check if MinIO is available
        try {
            $disk = Storage::disk('s3');
            if (!$disk->exists('/')) {
                echo "⚠️ MinIO not available, skipping ItemImageSeeder\n";
                return;
            }
        } catch (\Exception $e) {
            echo "⚠️ MinIO not available (" . $e->getMessage() . "), skipping ItemImageSeeder\n";
            return;
        }

        $items = Item::all();

        foreach ($items as $item) {
            $this->seedImagesForItem($disk, $item);
        }
    }

    private function seedImagesForItem($disk, Item $item): void
    {
        $prefix = $item->file_prefix ?? 'item';
        
        // Upload general images (1-5)
        for ($i = 1; $i <= 5; $i++) {
            $fileName = "{$prefix}_{$i}.jpg";
            $minioPath = "uploads/items/{$item->id}/{$fileName}";
            $this->uploadImage($disk, $item, $fileName, $minioPath);
        }

        // Upload variant images
        foreach ($item->variants as $variantIndex => $variant) {
            for ($i = 1; $i <= 5; $i++) {
                $fileName = "{$prefix}_v" . ($variantIndex + 1) . "_{$i}.jpg";
                $minioPath = "uploads/items/{$item->id}/{$fileName}";
                $this->uploadImage($disk, $item, $fileName, $minioPath);
            }
        }
    }

    private function uploadImage($disk, Item $item, string $fileName, string $minioPath): void
    {
        $sourcePath = storage_path("app/seed-images/{$fileName}");
        
        // Skip if source file doesn't exist
        if (!File::exists($sourcePath)) {
            return; // Silent skip
        }

        try {
            if (!$disk->exists($minioPath)) {
                $disk->put($minioPath, File::get($sourcePath));
            }
        } catch (\Exception $e) {
            // Silent fail - don't clutter output
        }
    }
}