<?php

namespace Tests\Feature\Admin;

use Tests\TestCase;
use App\Models\Auth\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Foundation\Testing\RefreshDatabase;

class CanvasAssetUploadTest extends TestCase
{
    use RefreshDatabase;

    /** @test */
    public function it_resolves_uploaded_canvas_images_with_proper_url_structures()
    {
        // 1. Mock S3/MinIO disk virtualization
        Storage::fake('s3');

        // 2. Create a test user
        $user = User::factory()->create();

        // 3. Generate a dummy image asset file mock
        $fakeImage = UploadedFile::fake()->image('canvas_diagram.jpg', 800, 600);

        // 4. Hit the asset upload API endpoint using the designated route profile
        $response = $this->actingAs($user)
            ->json('POST', '/admin/canvas/upload-asset', [
                'file' => $fakeImage
            ]);

        // 5. Assert response lifecycle integrity
        $response->assertStatus(200);
        
        $data = $response->json();
        
        $this->assertArrayHasKey('path', $data);
        $this->assertArrayHasKey('url', $data);

        // 6. Inspect the resolved URL path output
        $resolvedUrl = $data['url'];
        
        // This log will print inside your terminal window when running the test
        \Log::info("Resolved Canvas Asset URL Structure: " . $resolvedUrl);

        // 7. Environmental Proxy Assertions
        // If your application is building URLs with the production environment settings, 
        // this assertion will catch whether the domain matching alignment fails.
        if (config('filesystems.disks.s3.url')) {
            $this->assertStringContainsString(
                'duka-images', 
                $resolvedUrl, 
                "The resolved asset URL path doesn't contain the expected bucket path prefix target."
            );
        }
    }
}