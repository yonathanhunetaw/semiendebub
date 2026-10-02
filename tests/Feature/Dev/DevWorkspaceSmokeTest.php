<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Models\Auth\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\Test;
use SplFileInfo;
use Spatie\Permission\Models\Role;
use Symfony\Component\Finder\Finder;
use Tests\TestCase;

/**
 * Guards the Dev workspace: every sidebar destination resolves, and every dev
 * page wears Dev chrome rather than someone else's.
 */
class DevWorkspaceSmokeTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Co-located components under Pages/Dev that are never rendered as a page,
     * so they must NOT carry a layout.
     *
     * @var list<string>
     */
    private const CHILD_COMPONENTS = ['Color.tsx', 'ColorList.tsx', 'StarRating.tsx'];

    /**
     * Guest entry points, intentionally bare: Welcome is a self-contained
     * full-screen landing page and Login re-exports the shared Breeze screen
     * (GuestLayout). Neither takes Dev chrome.
     *
     * @var list<string>
     */
    private const BARE_PAGES = ['Login/index.tsx', 'Welcome/index.tsx'];

    private function devUser(): User
    {
        Role::findOrCreate('dev');

        $user = User::factory()->create([
            'role' => 'dev',
            'email_verified_at' => now(),
        ]);
        $user->assignRole('dev');

        return $user;
    }

    private function devHost(): string
    {
        return 'dev.'.config('app.system_domain');
    }

    #[Test]
    public function every_sidebar_option_renders_a_dev_component(): void
    {
        $expected = [
            '/dashboard' => 'Dev/Dashboard/index',
            '/architecture' => 'Dev/Architecture/Index',
            '/libraries' => 'Dev/Libraries/index',
            '/shipments' => 'Dev/Shipments/index',
            '/sessions' => 'Dev/Sessions/index',
            '/lesson4' => 'Dev/Lessons/Lesson4/index',
            '/lesson6' => 'Dev/Dashboard/Lesson6/Index',
            '/lesson6/create' => 'Dev/Lessons/Lesson6/CreateColor',
            '/lesson7' => 'Dev/Lessons/Lesson7/Index',
        ];

        $this->actingAs($this->devUser());
        $host = $this->devHost();

        foreach ($expected as $path => $component) {
            $this->get("http://{$host}{$path}")
                ->assertOk()
                ->assertInertia(fn (AssertableInertia $page) => $page->component($component));
        }
    }

    /**
     * Static guard against the failure the HTTP assertions above cannot see.
     *
     * Several dev pages carried `Page.layout = <DevLayout>` while ALSO wrapping
     * their body in `<Layout>` — an alias for AdminLayout — so Admin chrome
     * rendered nested inside Dev chrome. Status code and component name are
     * identical either way, so only reading the source catches it. Imports are
     * resolved back to their module, because the alias is what hid the bug.
     */
    #[Test]
    public function no_dev_page_references_a_non_dev_layout(): void
    {
        $pattern = '/import\s+([A-Za-z0-9_]+)\s+from\s+[\'"][^\'"]*Layouts\/([A-Za-z0-9_]+)[\'"]/';

        $offenders = [];

        foreach ($this->devPageFiles() as $file) {
            $source = (string) file_get_contents($file->getPathname());

            preg_match_all($pattern, $source, $matches, PREG_SET_ORDER);

            foreach ($matches as $match) {
                if ($match[2] !== 'DevLayout') {
                    $offenders[] = $this->relative($file).' imports '.$match[2].' as '.$match[1];
                }
            }
        }

        $this->assertSame(
            [],
            $offenders,
            "Dev pages must only ever reference DevLayout:\n".implode("\n", $offenders)
        );
    }

    #[Test]
    public function every_dev_page_attaches_the_dev_persistent_layout(): void
    {
        $missing = [];

        foreach ($this->devPageFiles() as $file) {
            $relative = $this->relative($file);

            if (in_array(str_replace('resources/js/Pages/Dev/', '', $relative), self::BARE_PAGES, true)) {
                continue;
            }

            $source = (string) file_get_contents($file->getPathname());

            // The assignment and its <DevLayout> tag may sit on separate lines.
            if (preg_match('/\.\s*layout\s*=[^;]*<DevLayout\b/s', $source) !== 1) {
                $missing[] = $relative;
            }
        }

        $this->assertSame([], $missing, "Dev pages without a DevLayout persistent layout:\n".implode("\n", $missing));
    }

    #[Test]
    public function co_located_child_components_carry_no_layout(): void
    {
        $offenders = [];

        foreach (self::CHILD_COMPONENTS as $name) {
            foreach (Finder::create()->files()->in(resource_path('js/Pages/Dev'))->name($name) as $file) {
                $source = (string) file_get_contents($file->getPathname());

                if (str_contains($source, '.layout =') || str_contains($source, 'Layouts/')) {
                    $offenders[] = $this->relative($file);
                }
            }
        }

        $this->assertSame([], $offenders, 'Child components must not take a layout: '.implode(', ', $offenders));
    }

    #[Test]
    public function the_libraries_page_lists_composer_and_npm_packages(): void
    {
        $host = $this->devHost();

        $this->actingAs($this->devUser())
            ->get("http://{$host}/libraries")
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Dev/Libraries/index')
                ->has('packages.composer')
                ->has('packages.npm')
                ->where('packages.totals.composer', fn (int $n): bool => $n > 0)
                ->where('packages.totals.npm', fn (int $n): bool => $n > 0)
                ->has('runtime.extensions')
                ->has('map')
            );
    }

    #[Test]
    public function the_libraries_refresh_endpoint_rewrites_the_map(): void
    {
        $host = $this->devHost();

        $this->actingAs($this->devUser())
            ->post("http://{$host}/libraries/refresh")
            ->assertRedirect()
            ->assertSessionHas('success');
    }

    #[Test]
    public function the_architecture_download_export_is_reachable(): void
    {
        $host = $this->devHost();

        $this->actingAs($this->devUser())->post("http://{$host}/libraries/refresh");

        $this->actingAs($this->devUser())
            ->get("http://{$host}/architecture/download")
            ->assertOk();
    }

    /**
     * Page components under resources/js/Pages/Dev, excluding co-located children.
     *
     * @return list<SplFileInfo>
     */
    private function devPageFiles(): array
    {
        $files = [];

        $finder = Finder::create()
            ->files()
            ->in(resource_path('js/Pages/Dev'))
            ->name(['*.tsx', '*.jsx']);

        foreach ($finder as $file) {
            if (! in_array($file->getFilename(), self::CHILD_COMPONENTS, true)) {
                $files[] = $file;
            }
        }

        return $files;
    }

    private function relative(SplFileInfo $file): string
    {
        return str_replace(base_path().'/', '', $file->getPathname());
    }
}
