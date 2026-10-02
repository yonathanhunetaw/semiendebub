<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * The /dev/logs viewer: source discovery, parsing, and the allowlist that
 * keeps a client-supplied identifier from becoming a path or a shell word.
 */
class LogViewerTest extends TestCase
{
    use RefreshDatabase;

    private function devUser(): User
    {
        Role::findOrCreate('dev');

        $user = User::factory()->create(['role' => 'dev', 'email_verified_at' => now()]);
        $user->assignRole('dev');

        return $user;
    }

    private function host(): string
    {
        return 'dev.'.config('app.system_domain');
    }

    private function seedLogFile(string $name, string $contents): string
    {
        $path = storage_path('logs/'.$name);

        file_put_contents($path, $contents);

        return $path;
    }

    #[Test]
    public function it_groups_sources_into_the_three_layers(): void
    {
        $this->seedLogFile('laravel.log', "[2026-10-02 00:00:00] local.INFO: hello\n");

        $this->actingAs($this->devUser())
            ->get('http://'.$this->host().'/logs')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Dev/Logs/index')
                ->has('categories', 3)
                ->where('categories.0.key', 'laravel')
                ->where('categories.1.key', 'deploy')
                ->where('categories.2.key', 'docker')
                ->has('docker.available')
            );
    }

    #[Test]
    public function it_never_exposes_absolute_paths_to_the_client(): void
    {
        $this->seedLogFile('laravel.log', "[2026-10-02 00:00:00] local.INFO: hello\n");

        $response = $this->actingAs($this->devUser())
            ->get('http://'.$this->host().'/logs')
            ->assertOk();

        $props = $response->viewData('page')['props'];

        foreach ($props['categories'] as $category) {
            foreach ($category['sources'] as $source) {
                $this->assertArrayNotHasKey('path', $source, 'Source nodes must not carry server paths.');
                $this->assertStringNotContainsString(base_path(), json_encode($source) ?: '');
            }
        }
    }

    #[Test]
    public function it_parses_laravel_entries_with_level_and_channel(): void
    {
        $this->seedLogFile('laravel.log', <<<'LOG'
[2026-10-02 00:45:20] local.ERROR: Something broke {"exception":"boom"}
#0 /var/www/html/app/Foo.php(12): bar()
#1 {main}
[2026-10-02 00:45:21] local.DEBUG: Fine again
LOG);

        $this->actingAs($this->devUser())
            ->getJson('http://'.$this->host().'/logs/fetch?source_type=file&identifier=storage/logs/laravel.log')
            ->assertOk()
            ->assertJsonPath('entries.0.level', 'ERROR')
            ->assertJsonPath('entries.0.channel', 'local')
            ->assertJsonPath('entries.1.level', 'DEBUG')
            // The two "#n" lines fold into the entry above as its trace.
            ->assertJsonPath('entries.0.trace', "#0 /var/www/html/app/Foo.php(12): bar()\n#1 {main}")
            ->assertJsonCount(2, 'entries');
    }

    #[Test]
    public function it_parses_deploy_script_entries(): void
    {
        $path = base_path('logs/deploy_29990101_000000.log');

        file_put_contents($path, "[2029-01-01 00:00:00] [SUCCESS] deploy started\n[2029-01-01 00:00:01] [ERROR] it failed\n");

        try {
            $this->actingAs($this->devUser())
                ->getJson('http://'.$this->host().'/logs/fetch?source_type=file&identifier=logs/deploy_29990101_000000.log')
                ->assertOk()
                ->assertJsonPath('entries.0.level', 'SUCCESS')
                ->assertJsonPath('entries.0.channel', 'deploy')
                ->assertJsonPath('entries.1.level', 'ERROR')
                ->assertJsonPath('entries.1.message', 'it failed');
        } finally {
            @unlink($path);
        }
    }

    #[Test]
    public function it_strips_ansi_colour_codes(): void
    {
        $this->seedLogFile('laravel.log', "[2026-10-02 00:00:00] local.INFO: \033[0;32mgreen text\033[0m done\n");

        $this->actingAs($this->devUser())
            ->getJson('http://'.$this->host().'/logs/fetch?source_type=file&identifier=storage/logs/laravel.log')
            ->assertOk()
            ->assertJsonPath('entries.0.message', 'green text done');
    }

    /**
     * The allowlist is the whole security model, so probe it directly.
     */
    #[Test]
    public function it_rejects_identifiers_outside_the_discovered_source_list(): void
    {
        $this->actingAs($this->devUser());

        $hostile = [
            '../.env',
            'storage/logs/../../.env',
            '/etc/passwd',
            'storage/logs/../../../../etc/passwd',
            'logs/../composer.json',
            'storage/logs/nope.log',
        ];

        foreach ($hostile as $identifier) {
            $this->getJson('http://'.$this->host().'/logs/fetch?source_type=file&identifier='.urlencode($identifier))
                ->assertNotFound();
        }
    }

    #[Test]
    public function it_rejects_shell_metacharacters_in_a_container_name(): void
    {
        $this->actingAs($this->devUser());

        foreach (['duka-dev-app; rm -rf /', '$(whoami)', 'app && cat /etc/passwd', 'nonexistent-container'] as $identifier) {
            $this->getJson('http://'.$this->host().'/logs/fetch?source_type=container&identifier='.urlencode($identifier))
                ->assertNotFound();
        }
    }

    #[Test]
    public function it_validates_the_source_type(): void
    {
        $this->actingAs($this->devUser())
            ->getJson('http://'.$this->host().'/logs/fetch?source_type=exec&identifier=whatever')
            ->assertStatus(422);
    }

    #[Test]
    public function it_truncates_a_writable_file_but_refuses_container_streams(): void
    {
        $path = $this->seedLogFile('laravel.log', "[2026-10-02 00:00:00] local.INFO: to be cleared\n");

        $this->actingAs($this->devUser())
            ->post('http://'.$this->host().'/logs/clear', [
                'source_type' => 'file',
                'identifier' => 'storage/logs/laravel.log',
            ])
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertSame('', (string) file_get_contents($path));

        $this->actingAs($this->devUser())
            ->post('http://'.$this->host().'/logs/clear', [
                'source_type' => 'container',
                'identifier' => 'duka-dev-app',
            ])
            ->assertRedirect()
            ->assertSessionHas('error');
    }

    #[Test]
    public function it_is_unreachable_outside_development(): void
    {
        $this->actingAs($this->devUser());

        app()->detectEnvironment(fn (): string => 'production');

        $this->get('http://'.$this->host().'/logs')->assertNotFound();
    }
}
