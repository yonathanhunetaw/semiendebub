<?php

namespace Tests\Unit;

use App\Services\ImageResolver;
use Tests\TestCase;

class ImageResolverTest extends TestCase
{
    public function test_it_builds_r2_urls_without_initializing_the_storage_adapter(): void
    {
        config()->set('filesystems.disks.r2.url', 'https://images.example.test');

        $this->assertSame(
            'https://images.example.test/uploads/items/example.jpg',
            ImageResolver::resolve('uploads/items/example.jpg'),
        );
    }

    public function test_it_normalizes_legacy_object_store_urls_to_the_r2_domain(): void
    {
        config()->set('filesystems.disks.r2.url', 'https://images.example.test');

        $this->assertSame(
            'https://images.example.test/uploads/items/example.jpg',
            ImageResolver::resolve('http://duka.test:9000/duka-images/uploads/items/example.jpg'),
        );
    }
}
