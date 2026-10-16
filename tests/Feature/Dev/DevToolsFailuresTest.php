<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Models\Auth\User;
use App\Services\Dev\DomainMapGenerator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The dev app when things go wrong: the domain map cannot be generated or is
 * unreadable, and the log viewer meets a large log or one that starts mid-way.
 * Real files under storage/ are put back as they were.
 */
class DevToolsFailuresTest extends TestCase
{
    use RefreshDatabase;

    private string $mapPath;

    private ?string $mapBefore;

    private string $logPath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapPath = storage_path('app/'.DomainMapGenerator::OUTPUT_FILE);
        $this->mapBefore = is_file($this->mapPath) ? (string) file_get_contents($this->mapPath) : null;
        $this->logPath = storage_path('logs/zz-phpunit-devtools.log');

        Role::findOrCreate('dev');
        $dev = User::factory()->create(['role' => 'dev', 'email_verified_at' => now()]);
        $dev->assignRole('dev');
        $this->actingAs($dev);
    }

    protected function tearDown(): void
    {
        $this->mapBefore === null ? File::delete($this->mapPath) : file_put_contents($this->mapPath, $this->mapBefore);
        File::delete($this->logPath);

        parent::tearDown();
    }

    private function host(): string
    {
        return 'http://dev.'.config('app.system_domain');
    }

    /** The generator is final, so give it a router that fails instead. */
    private function brokenGenerator(): void
    {
        $router = \Mockery::mock(\Illuminate\Routing\Router::class);
        $router->shouldReceive('getMiddleware', 'getMiddlewareGroups', 'getRoutes')->andThrow(new \RuntimeException('disk full'));

        $this->app->instance(DomainMapGenerator::class, new DomainMapGenerator($router, app(\App\Services\Dev\DomainClassifier::class)));
    }

    #[Test]
    public function the_visualizer_shows_why_the_map_could_not_be_generated(): void
    {
        File::delete($this->mapPath);
        $this->brokenGenerator();

        $this->get($this->host().'/architecture')->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('map', null)
                ->where('error', 'Failed to generate the domain map: disk full'));

        $this->post($this->host().'/architecture/regenerate')
            ->assertSessionHas('error', 'Failed to generate the domain map: disk full');
    }

    #[Test]
    public function an_unreadable_map_is_regenerated_on_the_next_visit(): void
    {
        file_put_contents($this->mapPath, '{not json');

        $this->get($this->host().'/architecture')->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->where('error', null)->has('map.routes'));

        $this->assertIsArray(json_decode((string) file_get_contents($this->mapPath), true));
    }

    #[Test]
    public function the_library_page_reports_a_failed_refresh_and_a_missing_map_is_stale(): void
    {
        File::delete($this->mapPath);
        $this->brokenGenerator();

        $this->get($this->host().'/libraries')->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->where('map.generated_at', null)->where('map.stale', true));

        $this->post($this->host().'/libraries/refresh')->assertSessionHas('error', 'Failed to refresh: disk full');
    }

    #[Test]
    public function a_large_log_is_read_from_its_end_without_a_torn_first_line(): void
    {
        // Over 512 KB: only the tail is read, and the partial line it starts in is dropped.
        $filler = str_repeat("[2026-10-01 00:00:00] local.DEBUG: filler line padded out to a decent length\n", 9000);
        file_put_contents($this->logPath, $filler."[2026-10-16 09:00:00] local.ERROR: the last one\n");

        $entries = $this->getJson($this->host().'/logs/fetch?source_type=file&identifier='.urlencode('storage/logs/zz-phpunit-devtools.log'))
            ->assertOk()->json('entries');

        $this->assertCount(300, $entries, 'capped at the newest 300');
        $this->assertSame('the last one', end($entries)['message']);
        $this->assertSame('ERROR', end($entries)['level']);
        foreach ($entries as $entry) {
            $this->assertNotNull($entry['timestamp'], 'no torn line becomes an entry of its own');
        }
    }

    #[Test]
    public function a_log_that_starts_with_plain_text_and_an_empty_log_are_handled(): void
    {
        file_put_contents($this->logPath, "warning: something odd before any stamp\n[2026-10-16 09:00:00] local.INFO: then a real entry\n    #0 a stack frame\n");

        $entries = $this->getJson($this->host().'/logs/fetch?source_type=file&identifier='.urlencode('storage/logs/zz-phpunit-devtools.log'))
            ->assertOk()->json('entries');

        $this->assertSame(['WARNING', 'INFO'], array_column($entries, 'level'));
        $this->assertNull($entries[0]['timestamp']);
        $this->assertSame('    #0 a stack frame', $entries[1]['trace']);

        file_put_contents($this->logPath, '');
        $this->getJson($this->host().'/logs/fetch?source_type=file&identifier='.urlencode('storage/logs/zz-phpunit-devtools.log'))
            ->assertOk()->assertJsonPath('entries', []);
    }
}
