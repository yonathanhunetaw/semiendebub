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
        $items = Item::all(); // Get all items created by ItemSeeder

        foreach ($items as $item) {
            // Retrieve the file prefix (ensure it's stored on the Item model or derived)
            // If you don't have it on the model, you can map it by name here
            $prefix = $this->getPrefixFromName($item->product_name);
            
            // 1. Upload General Images (1-5)
            for ($i = 1; $i <= 5; $i++) {
                $this->uploadImage($disk, $item, "{$prefix}_{$i}.jpg", "uploads/items/{$item->id}/{$prefix}_{$i}.jpg");
            }

            // 2. Upload Variant Images (v1-v9)
            for ($v = 1; $v <= 9; $v++) {
                for ($i = 1; $i <= 5; $i++) {
                    $this->uploadImage($disk, $item, "{$prefix}_v{$v}_{$i}.jpg", "uploads/items/{$item->id}/{$prefix}_v{$v}_{$i}.jpg");
                }
            }
        }
    }

    private function uploadImage($disk, $item, $fileName, $minioPath)
    {
        $sourcePath = storage_path("app/seed-images/{$fileName}");
        if (File::exists($sourcePath) && !$disk->exists($minioPath)) {
            $disk->put($minioPath, File::get($sourcePath));
        }
    }

    private function getPrefixFromName($name) {
        // Map your product names to their prefixes
        $map = ['Noteit' => 'noteit', 'Ring' => 'ring', 'Bic' => 'bic', /* ... */];
        return $map[$name] ?? 'default';
    }
}