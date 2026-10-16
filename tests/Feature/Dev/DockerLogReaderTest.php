<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Models\Auth\User;
use App\Services\Dev\DockerLogReader;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * DockerLogReader against a fake Docker Engine on a unix socket
 * (tests/Fixtures/fake-docker-engine.php), and the /dev/logs container view
 * that reads through it.
 */
class DockerLogReaderTest extends TestCase
{
    use RefreshDatabase;

    /** @var resource|null */
    private $engine = null;

    private string $socket;

    protected function setUp(): void
    {
        parent::setUp();

        // macOS caps a unix socket path near 104 bytes, so keep it short.
        $this->socket = '/tmp/duka-fake-docker-'.getmypid().'-'.substr(uniqid(), -5).'.sock';
        $this->engine = proc_open(
            [PHP_BINARY, base_path('tests/Fixtures/fake-docker-engine.php'), $this->socket],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
        );

        for ($i = 0; $i < 100 && ! file_exists($this->socket); $i++) {
            usleep(20_000);
        }

        $this->assertFileExists($this->socket, 'the fake engine did not start');
    }

    protected function tearDown(): void
    {
        if (is_resource($this->engine)) {
            proc_terminate($this->engine);
            proc_close($this->engine);
        }
        @unlink($this->socket);

        parent::tearDown();
    }

    private function reader(): DockerLogReader
    {
        return new DockerLogReader($this->socket);
    }

    #[Test]
    public function the_engine_is_available_when_the_socket_answers(): void
    {
        $this->assertTrue($this->reader()->available());
        $this->assertFalse((new DockerLogReader('/tmp/no-such-docker.sock'))->available());
    }

    #[Test]
    public function containers_are_listed_by_name_with_their_compose_health(): void
    {
        $containers = $this->reader()->containers();

        $this->assertSame(['broken', 'cron', 'duka-db', 'duka-prod-app'], array_column($containers, 'name'));

        $app = $containers[3];
        $this->assertSame('abcdef123456', $app['id'], 'ids are shortened to 12 characters');
        $this->assertSame('duka-app', $app['image']);
        $this->assertSame('running', $app['state']);
        $this->assertSame('healthy', $app['health']);

        $this->assertSame('health: starting', $containers[2]['health']);
        $this->assertSame('unhealthy', $containers[0]['health']);
        $this->assertNull($containers[1]['health'], 'no health check, no health');
        $this->assertSame('unknown', $containers[1]['state'], 'a missing state reads unknown');
    }

    #[Test]
    public function framed_logs_are_split_into_stdout_and_stderr(): void
    {
        $frames = $this->reader()->logs('app');

        $this->assertSame(['stdout', 'stderr', 'stdout'], array_column($frames, 'stream'));
        $this->assertStringContainsString('local.INFO: booted', $frames[0]['text']);
        $this->assertStringContainsString('PHP Fatal error: boom', $frames[1]['text']);
    }

    #[Test]
    public function a_tty_containers_raw_output_is_taken_whole_as_stdout(): void
    {
        $this->assertSame([['stream' => 'stdout', 'text' => "raw tty output\nsecond line\n"]], $this->reader()->logs('tty'));
    }

    #[Test]
    public function an_empty_missing_or_failing_container_has_no_logs(): void
    {
        $this->assertSame([], $this->reader()->logs('empty'));
        $this->assertSame([], $this->reader()->logs('ghost'));
        $this->assertSame([], $this->reader()->logs('broken'));
    }

    #[Test]
    public function nothing_is_listed_when_the_engine_is_unreachable(): void
    {
        $offline = new DockerLogReader('/tmp/no-such-docker.sock');

        $this->assertSame([], $offline->containers());
        $this->assertSame([], $offline->logs('app'));
    }

    // ---- through /dev/logs -------------------------------------------------

    private function devHost(): string
    {
        Role::findOrCreate('dev');
        $user = User::factory()->create(['role' => 'dev', 'email_verified_at' => now()]);
        $user->assignRole('dev');
        $this->actingAs($user);
        $this->app->instance(DockerLogReader::class, $this->reader());

        return 'http://dev.'.config('app.system_domain');
    }

    #[Test]
    public function the_log_viewer_lists_running_containers(): void
    {
        $host = $this->devHost();

        $this->get($host.'/logs')->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('docker.available', true)
                ->where('categories.2.key', 'docker')
                ->has('categories.2.sources', 4));
    }

    #[Test]
    public function a_containers_log_is_parsed_into_timestamped_levelled_entries(): void
    {
        $host = $this->devHost();

        $entries = $this->getJson($host.'/logs/fetch?source_type=container&identifier=duka-prod-app')
            ->assertOk()
            ->assertJsonPath('source_type', 'container')
            ->json('entries');

        $this->assertCount(4, $entries, 'blank lines are dropped');

        $this->assertSame('2026-10-16T08:00:00.000000000Z', $entries[0]['timestamp']);
        $this->assertSame('[2026-10-16] local.INFO: booted', $entries[0]['message']);
        $this->assertSame('INFO', $entries[0]['level']);
        $this->assertSame('stdout', $entries[0]['channel']);

        $this->assertSame('WARNING', $entries[1]['level']);
        $this->assertSame('STDERR', $entries[2]['level'], 'anything on stderr reads STDERR');
        $this->assertSame('stderr', $entries[2]['channel']);

        $this->assertNull($entries[3]['timestamp']);
        $this->assertSame('plain green line', $entries[3]['message'], 'colour codes are stripped');
    }
}
