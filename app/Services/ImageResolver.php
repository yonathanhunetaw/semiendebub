<?php

namespace App\Services;

use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;

/**
 * Single source of truth for turning a stored image path/key into a
 * browser-accessible URL.
 *
 * Stored values are always the raw MinIO object key, e.g.:
 *   uploads/items/42/cover.jpg
 *   uploads/variants/SKU-001-RED-L-PIECE-7/front.jpg
 *
 * This class converts them to the correct external URL using your
 * AWS_URL setting, and falls back gracefully when MinIO is down.
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

        // Already a full URL — trust it (covers seeded picsum/placeholder URLs too)
        if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
            return $path;
        }

        // Strip any legacy storage/ prefix that may have been saved historically
        $key = ltrim(preg_replace('#^storage/#', '', $path), '/');

        // Try to get a URL from the s3 disk.
        // Storage::disk('s3')->url() does NOT hit the network — it just builds the URL
        // from your AWS_URL / AWS_ENDPOINT config. This is safe even when MinIO is down.
        try {
            $url = Storage::disk('s3')->url($key);
            
            // Remove any accidental /storage/ that might get added from misconfiguration
            $url = str_replace('/storage/duka-images', '/duka-images', $url);
            $url = str_replace('/storage/', '/', $url);
            
            return $url;
        } catch (\Throwable $e) {
            Log::warning("ImageResolver: could not build URL for [{$key}]: " . $e->getMessage());
        }

        // Fallback: Try to construct URL directly from AWS_URL config
        $awsUrl = config('filesystems.disks.s3.url');
        if ($awsUrl && (str_starts_with($key, 'uploads/') || str_starts_with($key, 'images/'))) {
            // Clean the AWS URL first
            $cleanUrl = rtrim($awsUrl, '/');
            $cleanUrl = str_replace('/storage', '', $cleanUrl);
            return $cleanUrl . '/' . ltrim($key, '/');
        }

        // Last resort fallback for legacy public-disk paths
        if (str_starts_with($key, 'images/') || str_starts_with($key, 'uploads/')) {
            // Don't add /storage/ for MinIO images - use direct URL
            $directUrl = config('filesystems.disks.s3.url');
            if ($directUrl) {
                return rtrim($directUrl, '/') . '/' . ltrim($key, '/');
            }
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

        Storage::disk('s3')->put(
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

        Storage::disk('s3')->put($storagePath, $contents, 'public');

        return $storagePath;
    }
}