<?php

namespace Database\Seeders\Admin;

use App\Models\Item\Item;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;

class ItemImageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1️⃣ Map your generated item IDs to their corresponding disk file prefixes
        // (Make sure these prefixes match the base names of your images exactly)
        $itemFilePrefixes = [
            1 => '2025-1',
            2 => '2025-ብልጭልጭ',
            3 => '25k-1ፓሪስ',
            4 => '25k-5ጨርቅማስታወሻ',
        ];

        foreach ($itemFilePrefixes as $itemId => $prefix) {
            $item = Item::find($itemId);
            
            if (!$item) {
                $this->command->warn("Item ID {$itemId} not found in database, skipping image processing.");
                continue;
            }

            $itemImagesArray = [];

            // 2️⃣ Loop up to 5 images per product item
            for ($index = 1; $index <= 5; $index++) {
                $sourceFileName = "{$prefix}_{$index}.jpg";
                $sourcePath = storage_path("app/seed-images/{$sourceFileName}");
                
                // Destination directory structure inside your MinIO bucket
                $minioPath = "uploads/items/{$item->id}/{$sourceFileName}";

                // Check if the physical file is present in your local seed directory
                if (File::exists($sourcePath)) {
                    
                    // Check if it's already resting inside MinIO storage bucket disk
                    $existsInMinio = Storage::disk('minio')->exists($minioPath);

                    if (!$existsInMinio) {
                        // Stream the original file layout directly into MinIO using its true name
                        Storage::disk('minio')->put($minioPath, File::get($sourcePath));
                        $this->command->info("Uploaded new image to MinIO: {$minioPath}");
                    } else {
                        $this->command->line("Image already in MinIO, skipping upload: {$minioPath}");
                    }

                    // Append the verified file key to our item's collection array
                    $itemImagesArray[] = $minioPath;

                } else {
                    $this->command->warn("Seed source missing locally: {$sourcePath}");
                }
            }

            // 3️⃣ Save the true array paths back to the parent item entity block
            if (!empty($itemImagesArray)) {
                $item->update([
                    'general_images' => $itemImagesArray
                ]);
                $this->command->info("Successfully attached " . count($itemImagesArray) . " images to Item ID: {$item->id}");
            }
        }
    }
}