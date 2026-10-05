<?php

namespace Tests\Feature\Admin;

use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;
use App\Models\Auth\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Foundation\Testing\RefreshDatabase;

class CanvasAssetUploadTest extends TestCase
{
    use RefreshDatabase;

    #[Test]
    public function it_resolves_uploaded_canvas_images_with_proper_url_structures()
    {
        // 1. Fake the object store the controller actually writes to.
        // CanvasController::uploadAsset was migrated from the MinIO `s3` disk
        // to Cloudflare `r2`; faking `s3` left the upload hitting real R2,
        // which has no credentials under test and returned a 500.
        Storage::fake('r2');

        $this->withServerVariables(['HTTP_HOST' => 'admin.localhost']);

        // 2. Create a test user
        $user = User::factory()->create();

        // 3. Generate a dummy image asset file mock
        $fakeImage = UploadedFile::fake()->image('canvas_diagram.jpg', 800, 600);

        // The route is registered inside the admin domain group, so its name
        // is prefixed: admin.canvas.upload-asset.
        $url = route('admin.canvas.upload-asset');
        $response = $this->actingAs($user)
            ->post($url, [
                'file' => $fakeImage
            ]);

        // 5. Assert response lifecycle integrity
        $response->assertStatus(200);
        
        $data = $response->json();
        
        $this->assertArrayHasKey('path', $data);
        $this->assertArrayHasKey('url', $data);

        // The asset really landed on the disk.
        Storage::disk('r2')->assertExists($data['path']);

        // 6. Inspect the resolved URL path output
        $resolvedUrl = $data['url'];
        
        // 7. Environmental Proxy Assertions
        // If your application is building URLs with the production environment settings, 
        // this assertion will catch whether the domain matching alignment fails.
        if (config('filesystems.disks.r2.url')) {
            $this->assertStringContainsString(
                'duka-images', 
                $resolvedUrl, 
                "The resolved asset URL path doesn't contain the expected bucket path prefix target."
            );
        }
    }
}