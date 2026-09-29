<?php

declare(strict_types=1);

namespace App\Services\Dev;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;
use ReflectionClass;
use ReflectionMethod;
use ReflectionNamedType;
use Symfony\Component\Finder\Finder;
use Throwable;

/**
 * Maps every Eloquent model in app/Models to its table, relations, migrations,
 * factories and seeders — without ever touching the database.
 */
final class ModelInspector
{
    private const RELATION_TYPES = [
        'hasOne', 'hasMany', 'hasOneThrough', 'hasManyThrough',
        'belongsTo', 'belongsToMany',
        'morphTo', 'morphOne', 'morphMany', 'morphToMany', 'morphedByMany',
    ];

    /** @var array<string, list<array{file: string, kind: string}>>|null */
    private ?array $migrationIndex = null;

    /** @var array<string, list<string>>|null */
    private ?array $factoryIndex = null;

    /** @var array<string, list<string>>|null */
    private ?array $seederIndex = null;

    public function __construct(
        private readonly string $basePath,
        private readonly DomainClassifier $classifier,
    ) {
    }

    /**
     * @return array<string, array<string, mixed>> keyed by FQCN
     */
    public function all(): array
    {
        $models = [];

        foreach ($this->classesIn($this->basePath.'/app/Models', 'App\\Models\\') as $class) {
            if (! class_exists($class) || ! is_subclass_of($class, Model::class)) {
                continue;
            }

            try {
                $reflection = new ReflectionClass($class);
            } catch (Throwable) {
                continue;
            }

            if ($reflection->isAbstract()) {
                continue;
            }

            $models[$class] = $this->describe($class, $reflection);
        }

        ksort($models);

        return $models;
    }

    /**
     * @return array<string, mixed>
     */
    private function describe(string $class, ReflectionClass $reflection): array
    {
        $table = null;
        $fillable = [];
        $casts = [];
        $key = 'id';

        try {
            /** @var Model $instance */
            $instance = $reflection->newInstance();

            $table = $instance->getTable();
            $fillable = $instance->getFillable();
            $casts = array_map(
                static fn (mixed $cast): string => is_string($cast) ? $cast : 'custom',
                $instance->getCasts()
            );
            $key = $instance->getKeyName();
        } catch (Throwable) {
            $table = Str::snake(Str::pluralStudly(class_basename($class)));
        }

        $file = $reflection->getFileName() ?: null;

        return [
            'class' => $class,
            'short' => class_basename($class),
            'label' => str_replace('\\', '/', Str::after($class, 'App\\Models\\')),
            'domain' => $this->classifier->resolve([
                $this->classifier->fromNamespace($class),
            ]),
            'file' => $this->relative($file),
            'table' => $table,
            'primary_key' => $key,
            'fillable' => array_values($fillable),
            'casts' => $casts,
            'relations' => $this->relations($class, $reflection),
            'migrations' => $table !== null ? $this->migrationsFor($table) : [],
            'factories' => $this->factoriesFor($class),
            'seeders' => $this->seedersFor($class),
        ];
    }

    /**
     * @return list<array{name: string, type: string, related: ?string}>
     */
    private function relations(string $class, ReflectionClass $reflection): array
    {
        $relations = [];
        $file = $reflection->getFileName();
        $source = $file && is_readable($file) ? (string) file_get_contents($file) : '';
        $lines = $source !== '' ? (preg_split('/\R/', $source) ?: []) : [];

        foreach ($reflection->getMethods(ReflectionMethod::IS_PUBLIC) as $method) {
            if ($method->getDeclaringClass()->getName() !== $class || $method->getNumberOfParameters() > 0) {
                continue;
            }

            $returnType = $method->getReturnType();
            $declared = $returnType instanceof ReflectionNamedType ? class_basename($returnType->getName()) : null;

            $body = implode("\n", array_slice(
                $lines,
                max(0, $method->getStartLine() - 1),
                max(1, $method->getEndLine() - $method->getStartLine() + 1)
            ));

            $type = null;
            $related = null;

            if (preg_match('/\$this->('.implode('|', self::RELATION_TYPES).')\(\s*([A-Za-z0-9_\\\\]+)::class/', $body, $matches) === 1) {
                $type = $matches[1];
                $related = $matches[2];
            } elseif ($declared !== null && in_array(lcfirst($declared), self::RELATION_TYPES, true)) {
                $type = lcfirst($declared);
            }

            if ($type === null) {
                continue;
            }

            $relations[] = [
                'name' => $method->getName(),
                'type' => $type,
                'related' => $related !== null ? $this->qualify($related, $source) : null,
            ];
        }

        return $relations;
    }

    /**
     * Resolve a `Foo::class` token back to an FQCN using the file's imports.
     */
    private function qualify(string $token, string $source): string
    {
        $token = ltrim($token, '\\');

        if (str_contains($token, '\\')) {
            return $token;
        }

        if (preg_match('/^\s*use\s+([A-Za-z0-9_\\\\]*\\\\'.preg_quote($token, '/').')\s*;/mi', $source, $matches) === 1) {
            return trim($matches[1], '\\');
        }

        return $token;
    }

    /**
     * @return list<array{file: string, kind: string}>
     */
    private function migrationsFor(string $table): array
    {
        $this->migrationIndex ??= $this->buildMigrationIndex();

        return array_values($this->migrationIndex[$table] ?? []);
    }

    /**
     * @return array<string, list<array{file: string, kind: string}>>
     */
    private function buildMigrationIndex(): array
    {
        $index = [];
        $path = $this->basePath.'/database/migrations';

        if (! is_dir($path)) {
            return $index;
        }

        foreach (Finder::create()->files()->in($path)->name('*.php')->sortByName() as $file) {
            $contents = (string) $file->getContents();
            $relative = $this->relative($file->getRealPath() ?: $file->getPathname());

            foreach (['create' => 'Schema::create', 'alter' => 'Schema::table', 'drop' => 'Schema::dropIfExists'] as $kind => $needle) {
                if (preg_match_all('/'.preg_quote($needle, '/').'\(\s*[\'"]([a-z0-9_]+)[\'"]/i', $contents, $matches)) {
                    foreach (array_unique($matches[1]) as $table) {
                        $index[$table][(string) $relative.'|'.$kind] = ['file' => (string) $relative, 'kind' => $kind];
                    }
                }
            }
        }

        return $index;
    }

    /**
     * @return list<string>
     */
    private function factoriesFor(string $class): array
    {
        $this->factoryIndex ??= $this->buildClassIndex($this->basePath.'/database/factories');

        return $this->lookup($this->factoryIndex, $class);
    }

    /**
     * @return list<string>
     */
    private function seedersFor(string $class): array
    {
        $this->seederIndex ??= $this->buildClassIndex($this->basePath.'/database/seeders');

        return $this->lookup($this->seederIndex, $class);
    }

    /**
     * Index every file in a directory by the model FQCNs it references.
     *
     * @return array<string, list<string>>
     */
    private function buildClassIndex(string $path): array
    {
        $index = [];

        if (! is_dir($path)) {
            return $index;
        }

        foreach (Finder::create()->files()->in($path)->name('*.php')->sortByName() as $file) {
            $contents = (string) $file->getContents();
            $relative = (string) $this->relative($file->getRealPath() ?: $file->getPathname());

            if (preg_match_all('/App\\\\Models\\\\[A-Za-z0-9_\\\\]+/', $contents, $matches)) {
                foreach (array_unique($matches[0]) as $model) {
                    $index[$model][] = $relative;
                }
            }
        }

        return $index;
    }

    /**
     * @param  array<string, list<string>>  $index
     * @return list<string>
     */
    private function lookup(array $index, string $class): array
    {
        return array_values(array_unique($index[$class] ?? []));
    }

    /**
     * @return list<string>
     */
    private function classesIn(string $path, string $namespace): array
    {
        if (! is_dir($path)) {
            return [];
        }

        $classes = [];

        foreach (Finder::create()->files()->in($path)->name('*.php')->sortByName() as $file) {
            $relative = str_replace(
                [$path.DIRECTORY_SEPARATOR, '.php', DIRECTORY_SEPARATOR],
                ['', '', '\\'],
                $file->getRealPath() ?: $file->getPathname()
            );

            $classes[] = $namespace.$relative;
        }

        return $classes;
    }

    private function relative(?string $path): ?string
    {
        if ($path === null) {
            return null;
        }

        return ltrim(str_replace($this->basePath, '', $path), '/');
    }
}
