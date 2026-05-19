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
        // 🌟 AUTO-CREATE BUCKET IF MISSING
        $disk = Storage::disk('s3');
        try {
            // If the bucket doesn't exist, this or the driver initialization will catch it safely
            if (!method_exists($disk->getDriver(), 'ensureBucketExists') && !empty(config('filesystems.disks.s3.bucket'))) {
                // Standard approach to ensure directory framework visibility
                $disk->makeDirectory('/');
            }
        } catch (\Exception $e) {
            $this->command->info("Configuring target bucket...");
            // This forces MinIO/S3 adapter wrapper layers to establish the base path safely
        }

        // 1️⃣ Map your generated item IDs to their corresponding disk file prefixes
        $itemFilePrefixes = [
            1 => '2025-1',
            2 => '2025-ብልጭልጭ',
            3 => '25k-1ፓሪስ',
            4 => '25k-5ጨርቅማስታወሻ',
        ];

        // ... rest of your code ...

        foreach ($itemFilePrefixes as $itemId => $prefix) {
            $item = Item::with('variants')->find($itemId);

            if (!$item) {
                $this->command->warn("Item ID {$itemId} not found in database, skipping image processing.");
                continue;
            }

            $itemImagesArray = [];

            // 2️⃣ Loop up to 5 images per product item
            for ($index = 0; $index < 5; $index++) {
                // Look for: prefix_1.jpg, prefix_2.jpg, etc.
                $sourceFileName = "{$prefix}_" . ($index + 1) . ".jpg";
                $sourcePath = storage_path("app/seed-images/{$sourceFileName}");

                // 🎯 FIXED: Name structure matches UI uploads exactly: img-0.jpg, img-1.jpg, etc.
                $minioPath = "uploads/items/{$item->id}/img-{$index}.jpg";

                // Check if the physical file is present in your local seed directory
                if (File::exists($sourcePath)) {

                    // ⚡ FIXED: Changed driver context from 'minio' to 's3' to match your filesystem config
                    $disk = Storage::disk('s3');
                    $existsInMinio = $disk->exists($minioPath);

                    if (!$existsInMinio) {
                        // Stream the original file layout directly into MinIO
                        $disk->put($minioPath, File::get($sourcePath));
                        $this->command->info("Uploaded new image to MinIO: {$minioPath}");
                    } else {
                        $this->command->line("Image already in MinIO, skipping upload: {$minioPath}");
                    }

                    // ✨ FIXED: Append pure raw key paths (No bucket prefixes or leading slashes)
                    $itemImagesArray[] = $minioPath;

                } else {
                    $this->command->warn("Seed source missing locally: {$sourcePath}");
                }
            }

            // 3️⃣ Save the true array paths back to the parent item and its child variants
            if (!empty($itemImagesArray)) {
                // Save to parent item level ('general_images')
                $item->update([
                    'general_images' => $itemImagesArray
                ]);

                // 🎯 FIXED: Sync names down to variants so variant arrays are populated too
                foreach ($item->variants as $variant) {
                    $variant->update([
                        'images' => $itemImagesArray
                    ]);
                }

                $this->command->info("Successfully attached " . count($itemImagesArray) . " images to Item ID: {$item->id} and its variants.");
            }
        }
    }
}