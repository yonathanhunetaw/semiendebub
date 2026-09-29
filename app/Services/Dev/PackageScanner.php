<?php

declare(strict_types=1);

namespace App\Services\Dev;

use Illuminate\Support\Str;

/**
 * Reads composer.json / package.json (plus their lock files for resolved versions)
 * and groups every dependency into framework / ui / dev-tooling / utility buckets.
 */
final class PackageScanner
{
    public const GROUPS = ['framework', 'ui', 'dev', 'utility'];

    /**
     * Deliberate overrides — everything else falls through to the heuristics below.
     *
     * @var array<string, string>
     */
    private const GROUP_OVERRIDES = [
        'laravel/framework' => 'framework',
        'laravel/sanctum' => 'framework',
        'laravel/tinker' => 'dev',
        'inertiajs/inertia-laravel' => 'framework',
        'tightenco/ziggy' => 'framework',
        'spatie/laravel-permission' => 'framework',
        'league/flysystem-aws-s3-v3' => 'utility',
        'sentry/sentry-laravel' => 'utility',
        'felipeteko/monolog-loki' => 'utility',
        'php' => 'framework',
        'react' => 'framework',
        'react-dom' => 'framework',
        '@inertiajs/react' => 'framework',
        'vite' => 'dev',
        'laravel-vite-plugin' => 'dev',
        '@vitejs/plugin-react' => 'dev',
        'typescript' => 'dev',
        'concurrently' => 'dev',
        'axios' => 'utility',
        'three' => 'ui',
        'tldraw' => 'ui',
        'html5-qrcode' => 'utility',
        'npm' => 'dev',
        'install' => 'dev',
    ];

    /**
     * Curated documentation links; anything not listed falls back to the registry page.
     *
     * @var array<string, string>
     */
    private const DOC_LINKS = [
        'laravel/framework' => 'https://laravel.com/docs',
        'inertiajs/inertia-laravel' => 'https://inertiajs.com/server-side-setup',
        'laravel/sanctum' => 'https://laravel.com/docs/sanctum',
        'spatie/laravel-permission' => 'https://spatie.be/docs/laravel-permission',
        'tightenco/ziggy' => 'https://github.com/tighten/ziggy#readme',
        'sentry/sentry-laravel' => 'https://docs.sentry.io/platforms/php/guides/laravel/',
        'phpunit/phpunit' => 'https://docs.phpunit.de/',
        'laravel/pint' => 'https://laravel.com/docs/pint',
        'laravel/pail' => 'https://laravel.com/docs/logging#tailing-logs-using-pail',
        'react' => 'https://react.dev/reference/react',
        'react-dom' => 'https://react.dev/reference/react-dom',
        '@inertiajs/react' => 'https://inertiajs.com/client-side-setup',
        '@mui/material' => 'https://mui.com/material-ui/getting-started/',
        '@mui/icons-material' => 'https://mui.com/material-ui/material-icons/',
        '@mui/x-charts' => 'https://mui.com/x/react-charts/',
        'tailwindcss' => 'https://tailwindcss.com/docs',
        '@tailwindcss/forms' => 'https://github.com/tailwindlabs/tailwindcss-forms#readme',
        'vite' => 'https://vite.dev/guide/',
        'laravel-vite-plugin' => 'https://laravel.com/docs/vite',
        'typescript' => 'https://www.typescriptlang.org/docs/',
        'tldraw' => 'https://tldraw.dev/docs',
        'three' => 'https://threejs.org/docs/',
        'axios' => 'https://axios-http.com/docs/intro',
        'lucide-react' => 'https://lucide.dev/guide/packages/lucide-react',
        '@dnd-kit/core' => 'https://docs.dndkit.com/',
        '@headlessui/react' => 'https://headlessui.com/react/menu',
    ];

    public function __construct(private readonly string $basePath)
    {
    }

    /**
     * @return array{
     *     composer: array<string, list<array<string, mixed>>>,
     *     npm: array<string, list<array<string, mixed>>>,
     *     totals: array{composer: int, npm: int}
     * }
     */
    public function all(): array
    {
        $composer = $this->composerPackages();
        $npm = $this->npmPackages();

        return [
            'composer' => $this->group($composer),
            'npm' => $this->group($npm),
            'totals' => [
                'composer' => count($composer),
                'npm' => count($npm),
            ],
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function composerPackages(): array
    {
        $manifest = $this->json('composer.json');
        $lock = $this->json('composer.lock');

        $resolved = [];

        foreach (['packages', 'packages-dev'] as $section) {
            foreach ($lock[$section] ?? [] as $package) {
                if (isset($package['name'], $package['version'])) {
                    $resolved[$package['name']] = $package['version'];
                }
            }
        }

        $packages = [];

        foreach (['require' => false, 'require-dev' => true] as $section => $isDev) {
            foreach ($manifest[$section] ?? [] as $name => $constraint) {
                $packages[] = [
                    'name' => $name,
                    'constraint' => $constraint,
                    'version' => $resolved[$name] ?? null,
                    'dev' => $isDev,
                    'registry' => 'composer',
                    'group' => $this->groupFor($name, $isDev, 'composer'),
                    'docs' => self::DOC_LINKS[$name] ?? ($name === 'php'
                        ? 'https://www.php.net/docs.php'
                        : 'https://packagist.org/packages/'.$name),
                ];
            }
        }

        return $packages;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function npmPackages(): array
    {
        $manifest = $this->json('package.json');
        $lock = $this->json('package-lock.json');

        $packages = [];

        foreach (['dependencies' => false, 'devDependencies' => true] as $section => $isDev) {
            foreach ($manifest[$section] ?? [] as $name => $constraint) {
                $packages[] = [
                    'name' => $name,
                    'constraint' => $constraint,
                    'version' => $lock['packages']['node_modules/'.$name]['version'] ?? null,
                    'dev' => $isDev,
                    'registry' => 'npm',
                    'group' => $this->groupFor($name, $isDev, 'npm'),
                    'docs' => self::DOC_LINKS[$name] ?? 'https://www.npmjs.com/package/'.$name,
                ];
            }
        }

        return $packages;
    }

    private function groupFor(string $name, bool $isDev, string $registry): string
    {
        if (isset(self::GROUP_OVERRIDES[$name])) {
            return self::GROUP_OVERRIDES[$name];
        }

        if (Str::startsWith($name, ['@mui/', '@emotion/', '@headlessui/', '@fontsource/', '@radix-ui/'])
            || Str::contains($name, ['tailwind', 'icons', 'charts', 'react-icons'])) {
            return 'ui';
        }

        if ($isDev || Str::contains($name, ['phpunit', 'mockery', 'faker', 'debugbar', 'collision', 'pint', 'sail', 'breeze', 'eslint', 'prettier', '@types/', 'vite', 'postcss', 'autoprefixer'])) {
            return 'dev';
        }

        if ($registry === 'composer' && Str::startsWith($name, 'laravel/')) {
            return 'framework';
        }

        return 'utility';
    }

    /**
     * @param  list<array<string, mixed>>  $packages
     * @return array<string, list<array<string, mixed>>>
     */
    private function group(array $packages): array
    {
        $grouped = array_fill_keys(self::GROUPS, []);

        foreach ($packages as $package) {
            $grouped[$package['group']][] = $package;
        }

        foreach ($grouped as $group => $items) {
            usort($items, static fn (array $a, array $b): int => strcmp((string) $a['name'], (string) $b['name']));
            $grouped[$group] = $items;
        }

        return $grouped;
    }

    /**
     * @return array<string, mixed>
     */
    private function json(string $file): array
    {
        $path = $this->basePath.'/'.$file;

        if (! is_readable($path)) {
            return [];
        }

        $decoded = json_decode((string) file_get_contents($path), true);

        return is_array($decoded) ? $decoded : [];
    }
}
