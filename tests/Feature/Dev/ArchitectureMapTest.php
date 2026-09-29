<?php

declare(strict_types=1);

namespace Tests\Feature\Dev;

use App\Services\Dev\DomainClassifier;
use App\Services\Dev\DomainMapGenerator;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Support\Facades\File;
use Inertia\Testing\AssertableInertia;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * The Domain Module Visualizer: generator output, the /dev/architecture page,
 * and the environment guard that keeps both out of production.
 */
class ArchitectureMapTest extends TestCase
{
    private string $mapPath;

    protected function setUp(): void
    {
        parent::setUp();

        $this->mapPath = storage_path('app/'.DomainMapGenerator::OUTPUT_FILE);

        File::delete($this->mapPath);
    }

    protected function tearDown(): void
    {
        File::delete($this->mapPath);

        parent::tearDown();
    }

    #[Test]
    public function it_generates_a_map_covering_every_domain_asset(): void
    {
        $map = app(DomainMapGenerator::class)->generate();

        $this->assertSame(DomainMapGenerator::SCHEMA_VERSION, $map['schema_version']);
        $this->assertGreaterThan(0, $map['stats']['routes']);
        $this->assertGreaterThan(0, $map['stats']['models']);
        $this->assertGreaterThan(0, $map['stats']['pages']);

        $this->assertSame(
            DomainClassifier::DOMAINS,
            array_column($map['domains'], 'key'),
            'Every canonical domain must be present, in a stable order.'
        );

        foreach ($map['routes'] as $route) {
            $this->assertContains($route['domain'], DomainClassifier::DOMAINS);
            $this->assertArrayHasKey('type', $route['action']);
        }
    }

    #[Test]
    public function it_traces_a_controller_action_to_its_models_services_and_page(): void
    {
        $map = app(DomainMapGenerator::class)->generate();

        $route = collect($map['routes'])->firstWhere('name', 'seller.shipments.index');

        $this->assertNotNull($route, 'Expected the seller shipments index route to be mapped.');
        $this->assertSame('seller', $route['domain']);
        $this->assertSame('App\\Http\\Controllers\\Seller\\ShipmentController', $route['action']['class']);
        $this->assertSame('index', $route['action']['method']);
        $this->assertContains('App\\Models\\Fulfillment\\Shipment', $route['models']);
        $this->assertContains('Seller/Shipments/index', $route['pages']);
        $this->assertStringContainsString('routes/web/seller/seller.php', (string) $route['action']['source']);
    }

    #[Test]
    public function it_maps_models_to_their_migrations_and_seeders(): void
    {
        $map = app(DomainMapGenerator::class)->generate();

        $shipment = collect($map['models'])->firstWhere('class', 'App\\Models\\Fulfillment\\Shipment');

        $this->assertNotNull($shipment);
        $this->assertSame('shipments', $shipment['table']);
        $this->assertNotEmpty($shipment['migrations']);
        $this->assertNotEmpty($shipment['relations']);
    }

    #[Test]
    public function controller_and_route_back_references_are_symmetric(): void
    {
        $map = app(DomainMapGenerator::class)->generate();

        $controllers = collect($map['controllers'])->keyBy('class');

        foreach ($map['routes'] as $route) {
            $class = $route['action']['class'];

            if ($class === null) {
                $this->assertSame('closure', $route['action']['type']);

                continue;
            }

            $this->assertTrue(
                $controllers->has($class),
                "Route {$route['uri']} points at {$class}, which is missing from the controller index."
            );

            $this->assertContains(
                $route['id'],
                array_column($controllers[$class]['routes'], 'id'),
                "Controller {$class} does not list route {$route['uri']} among its routes."
            );
        }
    }

    #[Test]
    public function model_and_page_usage_is_linked_back_to_routes(): void
    {
        $map = app(DomainMapGenerator::class)->generate();

        $models = collect($map['models'])->keyBy('class');
        $pages = collect($map['pages'])->keyBy('component');

        foreach ($map['routes'] as $route) {
            foreach ($route['models'] as $model) {
                if ($models->has($model)) {
                    $this->assertContains($route['id'], array_column($models[$model]['routes'], 'id'));
                }
            }

            foreach ($route['pages'] as $component) {
                $this->assertTrue($pages->has($component), "Rendered page {$component} is missing from the page index.");
                $this->assertContains($route['id'], array_column($pages[$component]['routes'], 'id'));
            }
        }
    }

    #[Test]
    public function domain_summary_counts_match_the_underlying_collections(): void
    {
        $map = app(DomainMapGenerator::class)->generate();

        foreach ($map['domains'] as $domain) {
            $this->assertSame(
                count(array_filter($map['routes'], fn (array $route): bool => $route['domain'] === $domain['key'])),
                $domain['counts']['routes'],
                "Route count for the {$domain['key']} domain is out of sync."
            );

            $this->assertSame(
                count(array_filter($map['pages'], fn (array $page): bool => $page['domain'] === $domain['key'])),
                $domain['counts']['pages'],
                "Page count for the {$domain['key']} domain is out of sync."
            );
        }
    }

    #[Test]
    public function it_groups_composer_and_npm_dependencies(): void
    {
        $map = app(DomainMapGenerator::class)->generate();

        $composer = collect($map['packages']['composer'])->flatten(1);

        $this->assertTrue($composer->contains(fn (array $package): bool => $package['name'] === 'laravel/framework'));
        $this->assertGreaterThan(0, $map['packages']['totals']['npm']);

        foreach ($composer as $package) {
            $this->assertStringStartsWith('http', $package['docs']);
        }
    }

    #[Test]
    public function the_visualizer_renders_and_generates_the_map_on_first_visit(): void
    {
        $this->assertFileDoesNotExist($this->mapPath);

        $this->get('/dev/architecture')
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('Dev/Architecture/Index')
                ->where('error', null)
                ->has('map.routes')
                ->has('map.packages')
                ->where('endpoints.regenerate', '/dev/architecture/regenerate')
            );

        $this->assertFileExists($this->mapPath);
    }

    #[Test]
    public function the_sync_endpoint_rewrites_the_map(): void
    {
        $this->post('/dev/architecture/regenerate')
            ->assertRedirect()
            ->assertSessionHas('success');

        $this->assertFileExists($this->mapPath);
        $this->assertIsArray(json_decode((string) File::get($this->mapPath), true));
    }

    #[Test]
    public function it_is_unreachable_outside_development_environments(): void
    {
        app()->detectEnvironment(fn (): string => 'production');

        // CSRF verification is env-aware, so bypass it to reach the controller guard itself.
        $this->withoutMiddleware(ValidateCsrfToken::class);

        $this->get('/dev/architecture')->assertNotFound();
        $this->post('/dev/architecture/regenerate')->assertNotFound();
        $this->get('/dev/architecture/download')->assertNotFound();
    }
}
