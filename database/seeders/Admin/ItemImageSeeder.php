<?php
namespace Database\Seeders\Admin;

use App\Models\Item\ItemVariant;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;

class ItemImageSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // 1. Get variants with their parent items
        $variants = ItemVariant::with('item')->get();

        foreach ($variants as $variant) {
            $productName = $variant->item?->product_name ?? 'Unknown_Product';

            // Use snake_case to match your file naming convention
            $sanitizedProductName = Str::snake($productName);

            // 2. Define the source images in your permanent storage/app/seed-images folder
            $seedSources = [
                "{$sanitizedProductName}_1.jpg",
                "{$sanitizedProductName}_2.jpg",
            ];

            foreach ($seedSources as $index => $sourceFileName) {
                $sku = $variant->sku ?? 'v' . $variant->id;
                $minioPath = "uploads/variants/{$sku}/{$sku}_" . ($index + 1) . ".jpg";
                $sourcePath = storage_path("app/seed-images/{$sourceFileName}");

                // 1. Check if the file is ALREADY in MinIO
                $existsInMinio = Storage::disk('s3')->exists($minioPath);

                if (!$existsInMinio) {
                    // 2. Only upload if it's missing from MinIO
                    if (File::exists($sourcePath)) {
                        Storage::disk('s3')->put($minioPath, File::get($sourcePath));
                        $this->command->info("Uploaded new image to MinIO: {$minioPath}");
                    } else {
                        $this->command->warn("Seed source missing locally: {$sourcePath}");
                        continue; // Skip DB insert if we have no file at all
                    }
                } else {
                    $this->command->line("Image already in MinIO, skipping upload: {$minioPath}");
                }

                // 3. ALWAYS recreate the DB record (because migrate:fresh deleted it)
                DB::table('item_images')->updateOrInsert(
                    ['item_variant_id' => $variant->id, 'image_path' => $minioPath],
                    ['created_at' => now(), 'updated_at' => now()]
                );
            }
        }
    }
}
