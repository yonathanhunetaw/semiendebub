<?php

declare(strict_types=1);

namespace App\Services\Dev;

use Closure;
use Illuminate\Routing\Route;
use Illuminate\Routing\Router;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use Symfony\Component\Finder\Finder;
use Throwable;

/**
 * Builds the full "domain module map" of the application: every route traced
 * through its controller action to the models, services, form requests and
 * Inertia pages it touches, plus the model/migration graph and dependency list.
 *
 * The result is a plain array that is serialized to
 * storage/app/dev-architecture-map.json and consumed by /dev/architecture.
 */
final class DomainMapGenerator
{
    public const OUTPUT_FILE = 'dev-architecture-map.json';

    public const SCHEMA_VERSION = 1;

    private readonly string $basePath;

    private readonly ControllerInspector $controllers;

    private readonly ModelInspector $models;

    private readonly PageScanner $pages;

    private readonly PackageScanner $packages;

    /** @var array<string, string> middleware FQCN => registered alias */
    private array $middlewareAliases = [];

    /** @var array<string, array{file: string, line: int}>|null */
    private ?array $routeSourceIndex = null;

    public function __construct(
        private readonly Router $router,
        private readonly DomainClassifier $classifier,
        ?string $basePath = null,
    ) {
        $this->basePath = rtrim($basePath ?? base_path(), '/');
        $this->controllers = new ControllerInspector($this->basePath);
        $this->models = new ModelInspector($this->basePath, $this->classifier);
        $this->pages = new PageScanner($this->basePath, $this->classifier);
        $this->packages = new PackageScanner($this->basePath);
    }

    /**
     * Generate the map and persist it as JSON. Returns the absolute output path.
     */
    public function write(?string $path = null): string
    {
        $path = $path ?? storage_path('app/'.self::OUTPUT_FILE);

        File::ensureDirectoryExists(dirname($path));
        File::put($path, json_encode(
            $this->generate(),
            JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
        ) ?: '{}');

        return $path;
    }

    /**
     * @return array<string, mixed>
     */
    public function generate(): array
    {
        $startedAt = microtime(true);

        $this->middlewareAliases = array_flip(array_map(
            static fn (mixed $class): string => is_string($class) ? $class : '',
            $this->router->getMiddleware()
        ));

        $models = $this->models->all();
        $pages = $this->pages->all();
        $services = $this->serviceIndex();

        $routes = [];
        $controllers = [];
        $middlewareTags = [];
        $methodTags = [];

        foreach ($this->router->getRoutes() as $route) {
            $node = $this->describeRoute($route, $controllers);

            $routes[] = $node;

            foreach ($node['middleware'] as $tag) {
                $middlewareTags[$tag] = ($middlewareTags[$tag] ?? 0) + 1;
            }

            foreach ($node['methods'] as $method) {
                $methodTags[$method] = ($methodTags[$method] ?? 0) + 1;
            }
        }

        usort($routes, static function (array $a, array $b): int {
            return [$a['domain'], $a['uri'], $a['primary_method']] <=> [$b['domain'], $b['uri'], $b['primary_method']];
        });

        $this->backfillUsage($routes, $models, $pages, $services, $controllers);

        ksort($middlewareTags);
        ksort($controllers);

        arsort($methodTags);

        return [
            'schema_version' => self::SCHEMA_VERSION,
            'meta' => [
                'generated_at' => now()->toIso8601String(),
                'generated_by' => 'dev:generate-domain-map',
                'app_name' => (string) config('app.name'),
                'app_env' => (string) app()->environment(),
                'laravel_version' => app()->version(),
                'php_version' => PHP_VERSION,
                'duration_ms' => (int) round((microtime(true) - $startedAt) * 1000),
            ],
            'domains' => $this->domainSummaries($routes, $models, $pages, array_values($controllers)),
            'routes' => $routes,
            'controllers' => array_values($controllers),
            'models' => array_values($models),
            'services' => array_values($services),
            'pages' => array_values($pages),
            'filters' => [
                'methods' => array_keys($methodTags),
                'middleware' => array_keys($middlewareTags),
                'middleware_counts' => $middlewareTags,
            ],
            'packages' => $this->packages->all(),
            'stats' => [
                'routes' => count($routes),
                'controllers' => count($controllers),
                'models' => count($models),
                'services' => count($services),
                'pages' => count($pages),
                'orphan_pages' => count(array_filter($pages, static fn (array $page): bool => $page['routes'] === [])),
                'closure_routes' => count(array_filter($routes, static fn (array $route): bool => $route['action']['type'] === 'closure')),
            ],
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $controllers
     * @return array<string, mixed>
     */
    private function describeRoute(Route $route, array &$controllers): array
    {
        $uri = '/'.ltrim($route->uri(), '/');
        $name = $route->getName();
        $host = $route->domain();
        $methods = array_values(array_diff($route->methods(), ['HEAD']));

        $action = $this->describeAction($route, $controllers);

        $domain = $this->classifier->resolve([
            $host,
            $name !== null ? Str::before($name, '.') : null,
            trim($route->uri(), '/') !== '' ? Str::before(trim($route->uri(), '/'), '/') : null,
            $action['class'] !== null ? $this->classifier->fromNamespace($action['class']) : null,
            Arr::first($action['pages'] ?? []) !== null
                ? $this->classifier->fromPageComponent((string) Arr::first($action['pages']))
                : null,
        ]);

        return [
            'id' => substr(md5(implode('|', [implode(',', $methods), $host ?? '', $uri, $name ?? ''])), 0, 12),
            'domain' => $domain,
            'methods' => $methods,
            'primary_method' => $methods[0] ?? 'GET',
            'uri' => $uri,
            'name' => $name,
            'host' => $host,
            'url' => ($host !== null ? '//'.$host : '').$uri,
            'parameters' => $route->parameterNames(),
            'middleware' => $this->middlewareTags($route),
            'action' => Arr::except($action, ['models', 'services', 'requests', 'pages', 'links']),
            'models' => $action['models'],
            'services' => $action['services'],
            'requests' => $action['requests'],
            'pages' => $action['pages'],
            'links' => $action['links'],
        ];
    }

    /**
     * @param  array<string, array<string, mixed>>  $controllers
     * @return array<string, mixed>
     */
    private function describeAction(Route $route, array &$controllers): array
    {
        $uses = $route->getAction('uses');

        $base = [
            'type' => 'closure',
            'class' => null,
            'short' => null,
            'method' => null,
            'label' => 'Closure',
            'file' => null,
            'line' => null,
            'signature' => null,
            'source' => null,
            'models' => [],
            'services' => [],
            'requests' => [],
            'pages' => [],
            'links' => [],
        ];

        if ($uses instanceof Closure) {
            $closure = $this->controllers->inspectClosure($uses);

            return array_merge($base, [
                'file' => $closure['file'],
                'line' => $closure['line'],
                'source' => $closure['file'] !== null ? $closure['file'].':'.$closure['line'] : null,
                'models' => $closure['models'],
                'services' => $closure['services'],
                'pages' => $closure['pages'],
                'links' => $closure['links'],
            ]);
        }

        if (! is_string($uses) || $uses === '') {
            return $base;
        }

        [$class, $method] = str_contains($uses, '@')
            ? explode('@', $uses, 2)
            : [$uses, '__invoke'];

        $inspected = $this->controllers->inspect($class);
        $actionData = $inspected['actions'][$method] ?? null;

        if (! isset($controllers[$class])) {
            $controllers[$class] = [
                'class' => $class,
                'short' => $inspected['short'],
                'namespace' => $inspected['namespace'],
                'file' => $inspected['file'],
                'exists' => $inspected['exists'],
                'vendor' => ! str_starts_with($class, 'App\\'),
                'domain' => $this->classifier->resolve([
                    $route->domain(),
                    $this->classifier->fromNamespace($class),
                ]),
                'traits' => $inspected['traits'],
                'middleware' => $inspected['middleware'],
                'shared_dependencies' => $inspected['shared'],
                'actions' => array_values(array_map(
                    static fn (array $action): array => Arr::only($action, ['name', 'line', 'signature', 'models', 'services', 'requests', 'pages']),
                    $inspected['actions']
                )),
                'routes' => [],
            ];
        }

        $shared = $inspected['shared'];

        return array_merge($base, [
            'type' => $method === '__invoke' ? 'invokable' : 'controller',
            'class' => $class,
            'short' => $inspected['short'],
            'method' => $method,
            'label' => $inspected['short'].'@'.$method,
            'file' => $inspected['file'],
            'line' => $actionData['line'] ?? null,
            'signature' => $actionData['signature'] ?? null,
            'source' => $this->routeDefinition($class, $method),
            'models' => $this->merge($actionData['models'] ?? [], $shared['models']),
            'services' => $this->merge($actionData['services'] ?? [], $shared['services']),
            'requests' => $this->merge($actionData['requests'] ?? [], $shared['requests']),
            'pages' => $actionData['pages'] ?? [],
            'links' => $actionData['links'] ?? [],
        ]);
    }

    /**
     * Cross-link every node: which routes use a model/service/page, and which
     * routes belong to a controller.
     *
     * @param  list<array<string, mixed>>  $routes
     * @param  array<string, array<string, mixed>>  $models
     * @param  array<string, array<string, mixed>>  $pages
     * @param  array<string, array<string, mixed>>  $services
     * @param  array<string, array<string, mixed>>  $controllers
     */
    private function backfillUsage(array $routes, array &$models, array &$pages, array &$services, array &$controllers): void
    {
        foreach ($models as &$model) {
            $model['routes'] = [];
        }
        unset($model);

        foreach ($services as &$service) {
            $service['routes'] = [];
        }
        unset($service);

        foreach ($pages as &$page) {
            $page['routes'] = [];
        }
        unset($page);

        foreach ($routes as $route) {
            $reference = [
                'id' => $route['id'],
                'name' => $route['name'],
                'uri' => $route['uri'],
                'method' => $route['primary_method'],
                'domain' => $route['domain'],
            ];

            foreach ($route['models'] as $model) {
                if (isset($models[$model])) {
                    $models[$model]['routes'][] = $reference;
                }
            }

            foreach ($route['services'] as $service) {
                if (isset($services[$service])) {
                    $services[$service]['routes'][] = $reference;
                }
            }

            foreach ($route['pages'] as $component) {
                if (isset($pages[$component])) {
                    $pages[$component]['routes'][] = $reference;

                    continue;
                }

                // Referenced by a controller but missing on disk — surface it as a broken link.
                $pages[$component] = [
                    'component' => $component,
                    'domain' => $this->classifier->resolve([$this->classifier->fromPageComponent($component)], $route['domain']),
                    'file' => null,
                    'layout' => null,
                    'lines' => 0,
                    'exists' => false,
                    'routes' => [$reference],
                ];
            }

            $class = $route['action']['class'];

            if ($class !== null && isset($controllers[$class])) {
                $controllers[$class]['routes'][] = $reference;
            }
        }
    }

    /**
     * @param  list<array<string, mixed>>  $routes
     * @param  array<string, array<string, mixed>>  $models
     * @param  array<string, array<string, mixed>>  $pages
     * @param  list<array<string, mixed>>  $controllers
     * @return list<array<string, mixed>>
     */
    private function domainSummaries(array $routes, array $models, array $pages, array $controllers): array
    {
        $summaries = [];

        foreach ($this->classifier->catalog() as $key => $meta) {
            $summaries[] = $meta + [
                'counts' => [
                    'routes' => count(array_filter($routes, static fn (array $r): bool => $r['domain'] === $key)),
                    'controllers' => count(array_filter($controllers, static fn (array $c): bool => $c['domain'] === $key)),
                    'models' => count(array_filter($models, static fn (array $m): bool => $m['domain'] === $key)),
                    'pages' => count(array_filter($pages, static fn (array $p): bool => $p['domain'] === $key)),
                ],
            ];
        }

        return $summaries;
    }

    /**
     * Human-friendly middleware tags: registered aliases where possible,
     * class basenames otherwise.
     *
     * @return list<string>
     */
    private function middlewareTags(Route $route): array
    {
        $tags = [];

        foreach ($route->gatherMiddleware() as $middleware) {
            if ($middleware instanceof Closure) {
                $tags[] = 'closure';

                continue;
            }

            if (! is_string($middleware)) {
                continue;
            }

            [$class, $parameters] = array_pad(explode(':', $middleware, 2), 2, null);

            $alias = $this->middlewareAliases[$class] ?? null;
            $label = $alias ?? (str_contains($class, '\\') ? Str::snake(class_basename($class)) : $class);

            $tags[] = $parameters !== null ? $label.':'.$parameters : $label;
        }

        return array_values(array_unique($tags));
    }

    /**
     * Best-effort "which routes file declared this action".
     */
    private function routeDefinition(string $class, string $method): ?string
    {
        $this->routeSourceIndex ??= $this->buildRouteSourceIndex();

        $entry = $this->routeSourceIndex[$class.'@'.$method]
            ?? $this->routeSourceIndex[$class.'@__invoke']
            ?? null;

        return $entry !== null ? $entry['file'].':'.$entry['line'] : null;
    }

    /**
     * Index `routes/**\/*.php` by the controller action each line registers.
     * Aliases are resolved through each file's `use` statements so that, say,
     * Admin\ShipmentController and Seller\ShipmentController never collide.
     *
     * @return array<string, array{file: string, line: int}>
     */
    private function buildRouteSourceIndex(): array
    {
        $index = [];
        $path = $this->basePath.'/routes';

        if (! is_dir($path)) {
            return $index;
        }

        foreach (Finder::create()->files()->in($path)->name('*.php')->sortByName() as $file) {
            $relative = ltrim(str_replace($this->basePath, '', $file->getRealPath() ?: $file->getPathname()), '/');
            $contents = (string) $file->getContents();
            $lines = preg_split('/\R/', $contents) ?: [];

            preg_match_all(
                '/^\s*use\s+([A-Za-z0-9_\\\\]+)(?:\s+as\s+([A-Za-z0-9_]+))?\s*;/mi',
                $contents,
                $useMatches,
                PREG_SET_ORDER
            );

            $imports = [];

            foreach ($useMatches as $match) {
                $imported = trim($match[1], '\\');
                $imports[$match[2] ?? class_basename($imported)] = $imported;
            }

            foreach ($lines as $number => $line) {
                // Route::get('/x', [ShipmentController::class, 'index'])
                if (preg_match_all('/([A-Za-z0-9_\\\\]+)::class\s*(?:,\s*[\'"]([A-Za-z0-9_]+)[\'"])?/', $line, $matches, PREG_SET_ORDER)) {
                    foreach ($matches as $match) {
                        $resolved = $this->qualifyRouteAction($match[1], $imports);
                        $action = $match[2] ?? '__invoke';

                        $index[$resolved.'@'.$action] ??= ['file' => $relative, 'line' => $number + 1];
                    }
                }

                // Legacy string syntax: 'Admin\ShipmentController@index'
                if (preg_match('/[\'"]([A-Za-z0-9_\\\\]+Controller)@([A-Za-z0-9_]+)[\'"]/', $line, $matches) === 1) {
                    $resolved = $this->qualifyRouteAction($matches[1], $imports);

                    $index[$resolved.'@'.$matches[2]] ??= ['file' => $relative, 'line' => $number + 1];
                }
            }
        }

        return $index;
    }

    /**
     * @param  array<string, string>  $imports
     */
    private function qualifyRouteAction(string $token, array $imports): string
    {
        $token = ltrim($token, '\\');

        if (isset($imports[$token])) {
            return $imports[$token];
        }

        // Partially-qualified: Admin\ShipmentController relative to an import.
        $root = Str::before($token, '\\');

        if ($root !== $token && isset($imports[$root])) {
            return $imports[$root].'\\'.Str::after($token, '\\');
        }

        return str_contains($token, '\\') ? $token : 'App\\Http\\Controllers\\'.$token;
    }

    /**
     * Every class under app/Services, with the domain it belongs to.
     *
     * @return array<string, array<string, mixed>>
     */
    private function serviceIndex(): array
    {
        $path = $this->basePath.'/app/Services';

        if (! is_dir($path)) {
            return [];
        }

        $services = [];

        foreach (Finder::create()->files()->in($path)->name('*.php')->sortByName() as $file) {
            $relative = str_replace(
                [$path.DIRECTORY_SEPARATOR, '.php', DIRECTORY_SEPARATOR],
                ['', '', '\\'],
                $file->getRealPath() ?: $file->getPathname()
            );

            $class = 'App\\Services\\'.$relative;

            if (! class_exists($class)) {
                continue;
            }

            $methods = [];

            try {
                $reflection = new \ReflectionClass($class);

                foreach ($reflection->getMethods(\ReflectionMethod::IS_PUBLIC) as $method) {
                    if ($method->getDeclaringClass()->getName() === $class && ! str_starts_with($method->getName(), '__')) {
                        $methods[] = $method->getName();
                    }
                }
            } catch (Throwable) {
                // Ignore un-reflectable services.
            }

            $services[$class] = [
                'class' => $class,
                'short' => class_basename($class),
                'domain' => $this->classifier->resolve([$this->classifier->fromNamespace($class)]),
                'file' => ltrim(str_replace($this->basePath, '', $file->getRealPath() ?: $file->getPathname()), '/'),
                'methods' => $methods,
                'routes' => [],
            ];
        }

        return $services;
    }

    /**
     * @param  list<string>  $primary
     * @param  list<string>  $secondary
     * @return list<string>
     */
    private function merge(array $primary, array $secondary): array
    {
        $merged = array_values(array_unique(array_merge($primary, $secondary)));

        sort($merged);

        return $merged;
    }
}
