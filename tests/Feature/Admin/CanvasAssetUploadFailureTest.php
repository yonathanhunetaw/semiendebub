<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The canvas image upload when something goes wrong: a file that is not an
 * image, no file, and an object store that fails or returns no path.
 */
class CanvasAssetUploadFailureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $admin = User::factory()->create(['role' => 'admin']);
        $admin->assignRole('admin');
        $this->actingAs($admin);
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
    }

    private function upload(?UploadedFile $file)
    {
        return $this->postJson(route('admin.canvas.upload-asset'), $file ? ['file' => $file] : []);
    }

    #[Test]
    public function a_file_that_is_not_an_image_or_no_file_at_all_is_refused(): void
    {
        Storage::fake('r2');

        $this->upload(UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf'))->assertStatus(422)->assertJsonValidationErrors('file');
        $this->upload(null)->assertStatus(422)->assertJsonValidationErrors('file');
        $this->upload(UploadedFile::fake()->image('huge.png')->size(11000))->assertStatus(422);

        $this->assertSame([], Storage::disk('r2')->allFiles());
    }

    #[Test]
    public function a_failing_object_store_answers_500_with_a_hint(): void
    {
        $disk = \Mockery::mock(\Illuminate\Contracts\Filesystem\Filesystem::class);
        $disk->shouldReceive('putFile')->andThrow(new \RuntimeException('R2 credentials missing'));
        Storage::shouldReceive('disk')->with('r2')->andReturn($disk);

        $this->upload(UploadedFile::fake()->image('sketch.png'))
            ->assertStatus(500)
            ->assertJsonPath('error', 'Image upload failed. Check R2 configuration and Laravel logs.');
    }

    #[Test]
    public function an_object_store_that_returns_no_path_answers_500(): void
    {
        $disk = \Mockery::mock(\Illuminate\Contracts\Filesystem\Filesystem::class);
        $disk->shouldReceive('putFile')->andReturn(false);
        Storage::shouldReceive('disk')->with('r2')->andReturn($disk);

        $this->upload(UploadedFile::fake()->image('sketch.png'))
            ->assertStatus(500)
            ->assertJsonPath('error', 'Image upload did not return a storage path.');
    }
}
