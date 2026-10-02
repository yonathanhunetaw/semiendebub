<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Clears image keys that point at objects which do not exist, and corrects the
 * "Cartoon" packaging name.
 *
 * Background
 * ----------
 * Images are stored as raw object keys in two JSON columns —
 * `items.general_images` and `item_variants.images` — and resolved against the
 * r2 disk by App\Services\ImageResolver.
 *
 * An earlier revision of ItemSeeder wrote one key per variant image slot
 * whether or not the upload behind it had succeeded, and it uploaded to the
 * `s3` disk (MinIO, bucket duka-images) while the resolver reads from `r2`
 * (bucket canvas-assets). The result was 8,115 keys across 1,627 variants that
 * every surface in the application dutifully rendered as a broken image, plus
 * 47 literal nulls sitting inside the arrays.
 *
 * Those keys all share one shape — `uploads/items/<numeric id>/...` — and that
 * shape was verified over HTTP to 404 without exception, while the two live
 * shapes (`uploads/items/<file>` from admin uploads, and
 * `uploads/variants/<sku>/<file>`) return 200. This drops the former and keeps
 * the latter.
 *
 * A variant left with no keys is the honest state: the UI renders
 * PackagingPlaceholder, which draws the packaging tier instead of a broken
 * image icon.
 */
return new class extends Migration
{
    /** Keys under an item's numeric folder were written without a successful upload. */
    private const DEAD_KEY_PATTERN = '#^uploads/items/\d+/#';

    public function up(): void
    {
        $this->pruneDeadKeys('item_variants', 'images');
        $this->pruneDeadKeys('items', 'general_images');

        // Correct the spelling in place. The id is left alone on purpose:
        // ItemSeeder names this packaging type by numeric id in 133 places.
        DB::table('item_packaging_types')
            ->where('name', 'Cartoon')
            ->update(['name' => 'Carton']);

        // "Doz" is new to the vocabulary. Appended, never inserted, so the
        // existing ids keep their meaning.
        if (! DB::table('item_packaging_types')->where('name', 'Doz')->exists()) {
            DB::table('item_packaging_types')->insert([
                'id' => 7,
                'name' => 'Doz',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        // The dropped keys referenced objects that were never uploaded, so
        // there is nothing to restore and re-adding them would only recreate
        // the broken images. Only the rename is reversible.
        DB::table('item_packaging_types')
            ->where('name', 'Carton')
            ->update(['name' => 'Cartoon']);
    }

    /**
     * Rewrite a JSON array column, dropping dead keys and empty entries.
     *
     * Chunked rather than loaded whole: item_variants is 1,633 rows today but
     * the column is unbounded, and a seeded catalogue is the normal case.
     */
    private function pruneDeadKeys(string $table, string $column): void
    {
        DB::table($table)
            ->select(['id', $column])
            ->orderBy('id')
            ->chunk(500, function ($rows) use ($table, $column): void {
                foreach ($rows as $row) {
                    $keys = json_decode($row->{$column} ?? '[]', true);

                    if (! is_array($keys)) {
                        continue;
                    }

                    $kept = array_values(array_filter(
                        $keys,
                        fn ($key): bool => is_string($key)
                            && trim($key) !== ''
                            && ! preg_match(self::DEAD_KEY_PATTERN, $key),
                    ));

                    if ($kept === $keys) {
                        continue;
                    }

                    DB::table($table)
                        ->where('id', $row->id)
                        ->update([$column => json_encode($kept)]);
                }
            });
    }
};
