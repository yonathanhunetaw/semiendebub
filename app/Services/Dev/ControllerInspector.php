<?php

declare(strict_types=1);

namespace App\Services\Dev;

use Closure;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Str;
use ReflectionClass;
use ReflectionFunction;
use ReflectionMethod;
use ReflectionNamedType;
use ReflectionUnionType;
use Throwable;

/**
 * Statically traces a controller (or route closure) to the Models, Services,
 * Form Requests and Inertia pages it actually touches, per action method.
 */
final class ControllerInspector
{
    /** @var array<string, array<string, mixed>> */
    private array $cache = [];

    /** @var array<string, string> */
    private array $sourceCache = [];

    public function __construct(private readonly string $basePath)
    {
    }

    /**
     * @return array{
     *     class: string,
     *     short: string,
     *     namespace: string,
     *     file: ?string,
     *     exists: bool,
     *     traits: list<string>,
     *     middleware: list<string>,
     *     shared: array{models: list<string>, services: list<string>, requests: list<string>},
     *     actions: array<string, array{name: string, line: ?int, models: list<string>, services: list<string>, requests: list<string>, pages: list<string>, links: list<string>, signature: string}>
     * }
     */
    public function inspect(string $class): array
    {
        if (isset($this->cache[$class])) {
            return $this->cache[$class];
        }

        $blank = [
            'class' => $class,
            'short' => $this->shortName($class),
            'namespace' => Str::beforeLast($class, '\\'),
            'file' => null,
            'exists' => false,
            'traits' => [],
            'middleware' => [],
            'shared' => ['models' => [], 'services' => [], 'requests' => []],
            'actions' => [],
        ];

        if (! class_exists($class)) {
            return $this->cache[$class] = $blank;
        }

        try {
            $reflection = new ReflectionClass($class);
        } catch (Throwable) {
            return $this->cache[$class] = $blank;
        }

        $file = $reflection->getFileName() ?: null;

        $traits = array_values(array_filter(
            array_keys($this->allTraits($class)),
            static fn (string $trait): bool => str_starts_with($trait, 'App\\')
        ));

        $shared = $this->dependenciesFromStructure($reflection);

        $actions = [];

        foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
            if ($method->isStatic() || $method->isConstructor() || $method->isDestructor()) {
                continue;
            }

            $declaring = $method->getDeclaringClass()->getName();

            // Keep methods defined on the controller itself or on an app-owned trait/parent.
            if (! str_starts_with($declaring, 'App\\')) {
                continue;
            }

            if (in_array($declaring, ['App\\Http\\Controllers\\Controller'], true)) {
                continue;
            }

            if (str_starts_with($method->getName(), '__')) {
                continue;
            }

            $actions[$method->getName()] = $this->inspectMethod($method);
        }

        ksort($actions);

        return $this->cache[$class] = [
            'class' => $class,
            'short' => $this->shortName($class),
            'namespace' => Str::beforeLast($class, '\\'),
            'file' => $this->relative($file),
            'exists' => true,
            'traits' => $traits,
            'middleware' => $this->declaredMiddleware($class),
            'shared' => $shared,
            'actions' => $actions,
        ];
    }

    /**
     * Trace a route closure to the Inertia page(s) it renders.
     *
     * @return array{file: ?string, line: ?int, pages: list<string>, models: list<string>, services: list<string>, links: list<string>}
     */
    public function inspectClosure(Closure $closure): array
    {
        try {
            $reflection = new ReflectionFunction($closure);
        } catch (Throwable) {
            return ['file' => null, 'line' => null, 'pages' => [], 'models' => [], 'services' => [], 'links' => []];
        }

        $file = $reflection->getFileName() ?: null;
        $slice = $file
            ? $this->slice($file, (int) $reflection->getStartLine(), (int) $reflection->getEndLine())
            : '';

        $imports = $file ? $this->imports($file) : [];
        $found = $this->scanSlice($slice, $imports);

        return [
            'file' => $this->relative($file),
            'line' => $reflection->getStartLine() ?: null,
            'pages' => $found['pages'],
            'models' => $found['models'],
            'services' => $found['services'],
            'links' => $found['links'],
        ];
    }

    /**
     * Convert "App\Http\Controllers\Seller\ShipmentController" to "Seller/ShipmentController".
     */
    public function shortName(string $class): string
    {
        $trimmed = Str::after($class, 'App\\Http\\Controllers\\');

        if ($trimmed === $class) {
            $trimmed = class_basename($class);
        }

        return str_replace('\\', '/', $trimmed);
    }

    /**
     * @return array{name: string, line: ?int, models: list<string>, services: list<string>, requests: list<string>, pages: list<string>, links: list<string>, signature: string}
     */
    private function inspectMethod(ReflectionMethod $method): array
    {
        $file = $method->getFileName() ?: null;
        $slice = $file
            ? $this->slice($file, (int) $method->getStartLine(), (int) $method->getEndLine())
            : '';

        $imports = $file ? $this->imports($file) : [];
        $found = $this->scanSlice($slice, $imports);

        $parameters = [];

        foreach ($method->getParameters() as $parameter) {
            $types = $this->namedTypes($parameter->getType());
            $parameters[] = ($types !== [] ? class_basename($types[0]).' ' : '').'$'.$parameter->getName();

            foreach ($types as $type) {
                $bucket = $this->bucketFor($type);

                if ($bucket !== null) {
                    $found[$bucket][] = $type;
                }
            }
        }

        return [
            'name' => $method->getName(),
            'line' => $method->getStartLine() ?: null,
            'models' => $this->clean($found['models']),
            'services' => $this->clean($found['services']),
            'requests' => $this->clean($found['requests']),
            'pages' => $this->clean($found['pages']),
            'links' => $this->clean($found['links']),
            'signature' => $method->getName().'('.implode(', ', $parameters).')',
        ];
    }

    /**
     * Constructor injection + typed properties shared by every action of a controller.
     *
     * @return array{models: list<string>, services: list<string>, requests: list<string>}
     */
    private function dependenciesFromStructure(ReflectionClass $reflection): array
    {
        $found = ['models' => [], 'services' => [], 'requests' => []];

        $constructor = $reflection->getConstructor();

        if ($constructor !== null) {
            foreach ($constructor->getParameters() as $parameter) {
                foreach ($this->namedTypes($parameter->getType()) as $type) {
                    $bucket = $this->bucketFor($type);

                    if ($bucket !== null) {
                        $found[$bucket][] = $type;
                    }
                }
            }
        }

        foreach ($reflection->getProperties() as $property) {
            foreach ($this->namedTypes($property->getType()) as $type) {
                $bucket = $this->bucketFor($type);

                if ($bucket !== null) {
                    $found[$bucket][] = $type;
                }
            }
        }

        return [
            'models' => $this->clean($found['models']),
            'services' => $this->clean($found['services']),
            'requests' => $this->clean($found['requests']),
        ];
    }

    /**
     * Pull `$this->middleware(...)` declarations out of the constructor source.
     *
     * @return list<string>
     */
    private function declaredMiddleware(string $class): array
    {
        try {
            $reflection = new ReflectionClass($class);
            $constructor = $reflection->getConstructor();
        } catch (Throwable) {
            return [];
        }

        if ($constructor === null || $constructor->getFileName() === false) {
            return [];
        }

        $slice = $this->slice(
            $constructor->getFileName(),
            (int) $constructor->getStartLine(),
            (int) $constructor->getEndLine()
        );

        preg_match_all('/\$this->middleware\(\s*[\'"]([^\'"]+)[\'"]/', $slice, $matches);

        return $this->clean($matches[1] ?? []);
    }

    /**
     * Scan a chunk of PHP source for domain assets.
     *
     * @param  array<string, string>  $imports
     * @return array{models: list<string>, services: list<string>, requests: list<string>, pages: list<string>, links: list<string>}
     */
    private function scanSlice(string $slice, array $imports): array
    {
        $found = ['models' => [], 'services' => [], 'requests' => [], 'pages' => [], 'links' => []];

        if ($slice === '') {
            return $found;
        }

        // Inertia::render('Seller/Shipments/index') and inertia('Seller/...')
        if (preg_match_all('/(?:Inertia::render|(?<![\w>$])inertia)\(\s*[\'"]([^\'"]+)[\'"]/', $slice, $pages)) {
            $found['pages'] = $pages[1];
        }

        // Named route references for cross-linking nodes.
        if (preg_match_all('/(?:route|to_route)\(\s*[\'"]([a-z0-9_.\-]+)[\'"]/i', $slice, $links)) {
            $found['links'] = $links[1];
        }

        // Fully-qualified usages: \App\Models\Item\Item::query()
        if (preg_match_all('/\\\\?(App\\\\(?:Models|Services|Http\\\\Requests)\\\\[A-Za-z0-9_\\\\]+)/', $slice, $fqcn)) {
            foreach ($fqcn[1] as $class) {
                $bucket = $this->bucketFor($class);

                if ($bucket !== null) {
                    $found[$bucket][] = $class;
                }
            }
        }

        // Aliased usages resolved through the file's `use` statements.
        foreach ($imports as $alias => $class) {
            $bucket = $this->bucketFor($class);

            if ($bucket === null) {
                continue;
            }

            if (preg_match('/(?<![\w$>\\\\])'.preg_quote($alias, '/').'\b/', $slice) === 1) {
                $found[$bucket][] = $class;
            }
        }

        return [
            'models' => $this->clean($found['models']),
            'services' => $this->clean($found['services']),
            'requests' => $this->clean($found['requests']),
            'pages' => $this->clean($found['pages']),
            'links' => $this->clean($found['links']),
        ];
    }

    /**
     * Which asset bucket a class belongs to, or null when it is not interesting.
     */
    private function bucketFor(string $class): ?string
    {
        $class = ltrim($class, '\\');

        if (str_starts_with($class, 'App\\Http\\Requests\\')) {
            return 'requests';
        }

        if (str_starts_with($class, 'App\\Models\\')) {
            return 'models';
        }

        if (str_starts_with($class, 'App\\Services\\')) {
            return 'services';
        }

        if (! class_exists($class)) {
            return null;
        }

        if (is_subclass_of($class, FormRequest::class)) {
            return 'requests';
        }

        if (is_subclass_of($class, Model::class)) {
            return 'models';
        }

        return null;
    }

    /**
     * Namespace-level `use` statements for a file, keyed by alias.
     *
     * @return array<string, string>
     */
    private function imports(string $file): array
    {
        $source = $this->source($file);

        if ($source === '') {
            return [];
        }

        // Everything before the type declaration is the import section; trait
        // `use` statements live inside the class body and are skipped.
        $header = preg_split('/^\s*(?:final\s+|abstract\s+|readonly\s+)*(?:class|trait|interface|enum)\s/mi', $source)[0] ?? $source;

        preg_match_all(
            '/^\s*use\s+((?!function\s|const\s)[A-Za-z0-9_\\\\]+)(?:\s+as\s+([A-Za-z0-9_]+))?\s*;/mi',
            $header,
            $matches,
            PREG_SET_ORDER
        );

        $imports = [];

        foreach ($matches as $match) {
            $class = trim($match[1], '\\');
            $alias = $match[2] ?? class_basename($class);
            $imports[$alias] = $class;
        }

        return $imports;
    }

    /**
     * @return array<class-string, class-string>
     */
    private function allTraits(string $class): array
    {
        $traits = [];

        foreach (array_merge([$class => $class], class_parents($class) ?: []) as $current) {
            foreach (class_uses($current) ?: [] as $trait) {
                $traits[$trait] = $trait;
            }
        }

        return $traits;
    }

    private function slice(string $file, int $start, int $end): string
    {
        $source = $this->source($file);

        if ($source === '') {
            return '';
        }

        $lines = preg_split('/\R/', $source) ?: [];
        $offset = max(0, $start - 1);
        $length = max(1, $end - $start + 1);

        return implode("\n", array_slice($lines, $offset, $length));
    }

    private function source(string $file): string
    {
        if (isset($this->sourceCache[$file])) {
            return $this->sourceCache[$file];
        }

        return $this->sourceCache[$file] = is_readable($file) ? (string) file_get_contents($file) : '';
    }

    /**
     * @return list<string>
     */
    private function namedTypes(?\ReflectionType $type): array
    {
        if ($type instanceof ReflectionNamedType) {
            return $type->isBuiltin() ? [] : [$type->getName()];
        }

        if ($type instanceof ReflectionUnionType) {
            $names = [];

            foreach ($type->getTypes() as $inner) {
                $names = array_merge($names, $this->namedTypes($inner));
            }

            return $names;
        }

        return [];
    }

    /**
     * @param  array<int, string>  $values
     * @return list<string>
     */
    private function clean(array $values): array
    {
        $values = array_map(static fn (string $value): string => ltrim($value, '\\'), $values);

        $values = array_values(array_unique(array_filter($values)));

        sort($values);

        return $values;
    }

    private function relative(?string $path): ?string
    {
        if ($path === null) {
            return null;
        }

        return ltrim(str_replace($this->basePath, '', $path), '/');
    }
}
