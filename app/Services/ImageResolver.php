<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

/**
 * Single source of truth for turning a stored image path/key into a
 * browser-accessible URL.
 *
 * Stored values are raw R2 object keys, e.g.:
 *   uploads/items/42/cover.jpg
 *   uploads/variants/SKU-001-RED-L-PIECE-7/front.jpg
 *
 * This class converts them to the configured R2 public URL and normalizes
 * legacy MinIO URLs that use the same object key.
 */
class ImageResolver
{
    /**
     * Resolve a single stored path to a browser URL.
     *
     * @param  string|null  $path  Raw value from DB (key, full URL, or legacy path)
     * @param  string       $fallback  Asset path returned when resolution fails
     */
    public static function resolve(?string $path, string $fallback = 'images/defaults/no-image.png'): string
    {
        if (empty($path)) {
            return asset($fallback);
        }

        $path = trim($path);

        // Keep R2 URLs and third-party URLs (such as seeded placeholder images)
        // untouched. Legacy object-store URLs are normalized to their raw key.
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            $r2Url = rtrim((string) config('filesystems.disks.r2.url'), '/');
            if ($r2Url !== '' && str_starts_with($path, $r2Url . '/')) {
                return $path;
            }

            $urlPath = (string) parse_url($path, PHP_URL_PATH);
            if (preg_match('#/(uploads|images)/.+$#', $urlPath, $match)) {
                $path = ltrim($match[0], '/');
            } else {
                return $path;
            }
        }

        // Strip any legacy storage/ prefix that may have been saved historically
        $key = ltrim(preg_replace('#^storage/#', '', $path), '/');

        // Prefer the public R2 domain. This does not initialize the S3 adapter,
        // which keeps image rendering independent of upload credentials.
        $publicUrl = rtrim((string) config('filesystems.disks.r2.url'), '/');
        if ($publicUrl !== '') {
            return $publicUrl . '/' . $key;
        }

        // Fall back to the disk URL when no public R2 domain is configured.
        try {
            $url = Storage::disk('r2')->url($key);
            return $url;
        } catch (\Throwable $e) {
            Log::warning("ImageResolver: could not build URL for [{$key}]: " . $e->getMessage());
        }

        // Last resort fallback for legacy public-disk paths
        if (str_starts_with($key, 'images/') || str_starts_with($key, 'uploads/')) {
            return asset('storage/' . $key);
        }

        return asset($fallback);
    }

    /**
     * Resolve an array/collection of paths, skipping empties.
     *
     * @param  iterable<string|null>  $paths
     * @return array<string>
     */
    public static function resolveAll(iterable $paths, string $fallback = 'images/defaults/no-image.png'): array
    {
        $urls = [];
        foreach ($paths as $path) {
            if (!empty($path)) {
                $urls[] = self::resolve($path, $fallback);
            }
        }
        return $urls;
    }

    /**
     * Upload a local file to MinIO and return the stored key.
     * Used by seeders and factories to populate MinIO during fresh seeds.
     *
     * @param  string  $localPath   Absolute path to the file on disk
     * @param  string  $storagePath  Destination key in MinIO, e.g. "uploads/items/42/cover.jpg"
     * @return string  The key that was stored (save this to the DB column)
     * @throws \RuntimeException on upload failure
     */
    public static function uploadSeedImage(string $localPath, string $storagePath): string
    {
        if (!file_exists($localPath)) {
            throw new \RuntimeException("Seed image not found at [{$localPath}]");
        }

        Storage::disk('r2')->put(
            $storagePath,
            file_get_contents($localPath),
            'public'
        );

        return $storagePath; // Store the key, not the URL
    }

    /**
     * Download an image from a URL and upload it to MinIO.
     * Used by factories when no local seed images are committed to the repo.
     *
     * @param  string  $sourceUrl    URL to download from (e.g. picsum.photos)
     * @param  string  $storagePath  Destination key in MinIO
     * @return string  The key that was stored
     */
    public static function uploadFromUrl(string $sourceUrl, string $storagePath): string
    {
        $contents = @file_get_contents($sourceUrl);

        if ($contents === false) {
            throw new \RuntimeException("Could not download seed image from [{$sourceUrl}]");
        }

        Storage::disk('r2')->put($storagePath, $contents, 'public');

        return $storagePath;
    }
}
