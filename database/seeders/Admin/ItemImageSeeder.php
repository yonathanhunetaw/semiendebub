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
        $disk = Storage::disk('s3');
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

        // Upload variant images (v1 to v9)
        for ($v = 1; $v <= 9; $v++) {
            for ($i = 1; $i <= 5; $i++) {
                $fileName = "{$prefix}_v{$v}_{$i}.jpg";
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
            return; // Silent skip - many files won't exist
        }

        try {
            if (!$disk->exists($minioPath)) {
                $disk->put($minioPath, File::get($sourcePath), 'public');
                echo "✅ Uploaded: {$minioPath}\n";
            }
        } catch (\Exception $e) {
            // Silent fail - don't clutter output
            echo "⚠️ Could not upload {$fileName}: " . $e->getMessage() . "\n";
        }
    }
}