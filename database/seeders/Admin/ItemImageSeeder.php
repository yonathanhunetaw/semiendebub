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
                // The location on your Pi's disk (the Version 0 source)
                $sourcePath = storage_path("app/seed-images/{$sourceFileName}");

                // The final path inside the MinIO bucket
                $sku = $variant->sku ?? 'v' . $variant->id;
                $minioPath = "uploads/variants/{$sku}/{$sku}_" . ($index + 1) . ".jpg";

                // 3. Physical Move: If the source exists, push it to MinIO
                if (File::exists($sourcePath)) {
                    // This puts the file in MinIO (S3 disk)
                    Storage::disk('s3')->put($minioPath, File::get($sourcePath));

                    // 4. Database Insert: Save the MinIO path
                    DB::table('item_images')->insert([
                        'item_variant_id' => $variant->id,
                        'image_path' => $minioPath,
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);
                } else {
                    $this->command->warn("Seed image missing: {$sourcePath}");
                }
            }
        }
    }
}
