<?php

declare(strict_types=1);

namespace App\Http\Controllers\Dev;

use App\Http\Controllers\Controller;
use App\Services\Dev\DomainMapGenerator;
use App\Services\Dev\PackageScanner;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;
use Throwable;

/**
 * Dependency inventory: every composer and npm package the project declares,
 * grouped and resolved to the version actually installed.
 *
 * Reads straight from PackageScanner rather than from the generated map, so the
 * page is correct even when storage/app/dev-architecture-map.json is stale or
 * missing. The refresh action rewrites that map — the same work
 * `artisan dev:generate-domain-map` does — so the architecture page and the
 * counts shown here come back in step.
 */
final class LibraryController extends Controller
{
    /**
     * Environments allowed to reach the dev tooling.
     *
     * @var list<string>
     */
    private const ALLOWED_ENVIRONMENTS = ['local', 'development', 'testing'];

    public function __construct(private readonly DomainMapGenerator $generator)
    {
    }

    public function index(): Response
    {
        $this->guard();

        $packages = (new PackageScanner(base_path()))->all();

        return Inertia::render('Dev/Libraries/index', [
            'packages' => $packages,
            'runtime' => [
                'php' => PHP_VERSION,
                'laravel' => app()->version(),
                'environment' => (string) app()->environment(),
                'extensions' => $this->extensions(),
            ],
            'map' => $this->mapMeta(),
        ]);
    }

    /**
     * Re-run the domain map generator, then bounce back to this page.
     */
    public function refresh(): RedirectResponse
    {
        $this->guard();

        try {
            $this->generator->write();
        } catch (Throwable $exception) {
            report($exception);

            return back()->with('error', 'Failed to refresh: '.$exception->getMessage());
        }

        return back()->with('success', 'Dependency inventory and domain map refreshed.');
    }

    /**
     * Loaded PHP extensions, lower-cased and sorted for a stable display.
     *
     * @return list<string>
     */
    private function extensions(): array
    {
        $extensions = array_map('strtolower', get_loaded_extensions());

        sort($extensions);

        return array_values($extensions);
    }

    /**
     * When the domain map was last written, so the page can show whether a
     * refresh is warranted.
     *
     * @return array{generated_at: ?string, stale: bool}
     */
    private function mapMeta(): array
    {
        $path = storage_path('app/'.DomainMapGenerator::OUTPUT_FILE);

        if (! is_file($path)) {
            return ['generated_at' => null, 'stale' => true];
        }

        $timestamp = filemtime($path);

        if ($timestamp === false) {
            return ['generated_at' => null, 'stale' => true];
        }

        $generatedAt = now()->setTimestamp($timestamp);

        return [
            'generated_at' => $generatedAt->toIso8601String(),
            // A map older than either manifest no longer reflects the tree.
            'stale' => collect(['composer.json', 'package.json'])
                ->map(static fn (string $file): int => (int) @filemtime(base_path($file)))
                ->contains(static fn (int $manifest): bool => $manifest > $timestamp),
        ];
    }

    private function guard(): void
    {
        abort_unless(
            app()->environment(self::ALLOWED_ENVIRONMENTS),
            HttpResponse::HTTP_NOT_FOUND
        );
    }
}
