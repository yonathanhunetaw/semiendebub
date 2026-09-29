<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * Guards the Dev workspace navigation: every page on the `dev.` subdomain must
 * be reachable from the sidebar, not by URL only.
 */
class DevNavigationTest extends TestCase
{
    private const NAVIGATION_FILE = 'resources/js/Components/Navigation/Dev/devNavigation.ts';

    /**
     * Guest-only entry points, linked from the landing page rather than the sidebar.
     *
     * @var list<string>
     */
    private const EXCLUDED = ['/', '/login'];

    #[Test]
    public function every_dev_page_route_has_a_sidebar_link(): void
    {
        $hrefs = $this->navigationHrefs();

        $missing = [];

        foreach ($this->devPageRoutes() as $uri => $name) {
            if (! in_array($uri, $hrefs, true)) {
                $missing[] = "{$uri} ({$name})";
            }
        }

        $this->assertSame(
            [],
            $missing,
            'Dev routes without a sidebar entry in '.self::NAVIGATION_FILE.': '.implode(', ', $missing)
        );
    }

    #[Test]
    public function every_sidebar_link_points_at_a_real_dev_route(): void
    {
        $routes = array_keys($this->devPageRoutes());

        $dangling = array_values(array_diff($this->navigationHrefs(), $routes));

        $this->assertSame([], $dangling, 'Sidebar links with no matching dev route: '.implode(', ', $dangling));
    }

    #[Test]
    public function the_dev_landing_page_offers_login_and_registration(): void
    {
        $this->get(route('dev.welcome'))
            ->assertOk()
            ->assertInertia(fn ($page) => $page->component('Dev/Welcome/index'));

        // Both entry points the landing page links to must exist on this host.
        $this->get(route('login'))->assertOk();
        $this->get(route('register'))->assertOk();
    }

    /**
     * Non-parameterised GET routes on the dev subdomain, as uri => route name.
     *
     * @return array<string, string>
     */
    private function devPageRoutes(): array
    {
        $routes = [];

        /** @var RoutingRoute $route */
        foreach (Route::getRoutes() as $route) {
            $domain = (string) $route->domain();

            if (! Str::startsWith($domain, 'dev.') || ! in_array('GET', $route->methods(), true)) {
                continue;
            }

            $uri = '/'.trim($route->uri(), '/');

            if (str_contains($uri, '{') || in_array($uri, self::EXCLUDED, true)) {
                continue;
            }

            $routes[$uri] = (string) $route->getName();
        }

        ksort($routes);

        return $routes;
    }

    /**
     * @return list<string>
     */
    private function navigationHrefs(): array
    {
        $path = base_path(self::NAVIGATION_FILE);

        $this->assertFileExists($path);

        preg_match_all("/href:\s*'([^']+)'/", (string) file_get_contents($path), $matches);

        return array_values(array_unique($matches[1] ?? []));
    }
}
