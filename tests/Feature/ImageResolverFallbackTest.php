<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\ImageResolver;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * ImageResolver beyond the happy path in Tests\Unit\ImageResolverTest: empty
 * values, third-party URLs, a missing public domain, and the seed uploaders.
 */
class ImageResolverFallbackTest extends TestCase
{
    #[Test]
    public function an_empty_path_gives_the_placeholder_or_the_one_asked_for(): void
    {
        $this->assertSame(asset('images/defaults/no-image.png'), ImageResolver::resolve(null));
        $this->assertSame(asset('images/defaults/no-image.png'), ImageResolver::resolve(''));
        $this->assertSame(asset('img/blank.svg'), ImageResolver::resolve(null, 'img/blank.svg'));
    }

    #[Test]
    public function a_url_already_on_r2_or_on_another_site_is_left_alone(): void
    {
        config(['filesystems.disks.r2.url' => 'https://cdn.duka.test']);

        $this->assertSame('https://cdn.duka.test/uploads/x.jpg', ImageResolver::resolve('https://cdn.duka.test/uploads/x.jpg'));
        $this->assertSame('https://picsum.photos/200', ImageResolver::resolve('https://picsum.photos/200'));
    }

    #[Test]
    public function a_legacy_storage_prefix_and_surrounding_space_are_stripped(): void
    {
        config(['filesystems.disks.r2.url' => 'https://cdn.duka.test/']);

        $this->assertSame('https://cdn.duka.test/uploads/items/a.jpg', ImageResolver::resolve('  storage/uploads/items/a.jpg '));
        $this->assertSame('https://cdn.duka.test/uploads/items/a.jpg', ImageResolver::resolve('/uploads/items/a.jpg'));
    }

    #[Test]
    public function without_a_public_domain_the_disk_builds_the_url(): void
    {
        config(['filesystems.disks.r2.url' => null]);
        Storage::fake('r2');

        $this->assertStringEndsWith('uploads/items/a.jpg', ImageResolver::resolve('uploads/items/a.jpg'));
    }

    #[Test]
    public function when_the_disk_cannot_build_a_url_a_public_disk_path_or_the_placeholder_is_used(): void
    {
        config(['filesystems.disks.r2.url' => null]);
        Storage::shouldReceive('disk')->with('r2')->andThrow(new \RuntimeException('no adapter'));

        $this->assertSame(asset('storage/uploads/items/a.jpg'), ImageResolver::resolve('uploads/items/a.jpg'));
        $this->assertSame(asset('images/defaults/no-image.png'), ImageResolver::resolve('random/key.jpg'));
    }

    #[Test]
    public function resolve_all_skips_empty_values(): void
    {
        config(['filesystems.disks.r2.url' => 'https://cdn.duka.test']);

        $this->assertSame(
            ['https://cdn.duka.test/uploads/a.jpg', 'https://cdn.duka.test/uploads/b.jpg'],
            ImageResolver::resolveAll(['uploads/a.jpg', null, '', 'uploads/b.jpg']),
        );
    }

    #[Test]
    public function a_seed_image_is_uploaded_under_the_key_given(): void
    {
        Storage::fake('r2');
        $local = tempnam(sys_get_temp_dir(), 'seed');
        file_put_contents($local, 'jpeg-bytes');

        try {
            $this->assertSame('uploads/items/1/cover.jpg', ImageResolver::uploadSeedImage($local, 'uploads/items/1/cover.jpg'));
            $this->assertSame('jpeg-bytes', Storage::disk('r2')->get('uploads/items/1/cover.jpg'));

            $this->assertSame('uploads/items/2/cover.jpg', ImageResolver::uploadFromUrl($local, 'uploads/items/2/cover.jpg'));
            Storage::disk('r2')->assertExists('uploads/items/2/cover.jpg');
        } finally {
            @unlink($local);
        }
    }

    #[Test]
    public function a_missing_seed_image_is_an_error(): void
    {
        Storage::fake('r2');

        try {
            ImageResolver::uploadSeedImage('/no/such/file.jpg', 'x.jpg');
            $this->fail('expected a missing local image to throw');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Seed image not found', $e->getMessage());
        }

        $this->expectExceptionMessage('Could not download seed image');
        ImageResolver::uploadFromUrl('/no/such/file.jpg', 'y.jpg');
    }
}
