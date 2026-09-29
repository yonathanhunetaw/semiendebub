<?php

declare(strict_types=1);

namespace App\Http\Controllers\Dev;

use App\Http\Controllers\Controller;
use App\Services\Dev\DomainMapGenerator;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;
use Throwable;

/**
 * Serves the self-updating Domain Module Visualizer.
 *
 * Strictly local/dev tooling: every action aborts outside a development
 * environment so the map (which exposes the full internal surface area of the
 * app) can never leak from staging or production.
 */
final class ArchitectureController extends Controller
{
    /**
     * Environments allowed to reach the visualizer.
     *
     * @var list<string>
     */
    private const ALLOWED_ENVIRONMENTS = ['local', 'development', 'testing'];

    public function __construct(private readonly DomainMapGenerator $generator)
    {
    }

    /**
     * Render the visualizer, generating the map on first visit.
     */
    public function index(Request $request): Response
    {
        $this->guard();

        $path = $this->mapPath();
        $error = null;

        if (! File::exists($path)) {
            $error = $this->regenerateMap();
        }

        $map = $this->readMap($path);

        if ($map === null && $error === null) {
            $error = $this->regenerateMap();
            $map = $this->readMap($path);
        }

        return Inertia::render('Dev/Architecture/Index', [
            'map' => $map,
            'error' => $error,
            'endpoints' => [
                'regenerate' => $this->siblingUrl($request, 'regenerate'),
                'download' => $this->siblingUrl($request, 'download'),
            ],
        ]);
    }

    /**
     * Re-run the generator and bounce back to the visualizer.
     */
    public function regenerate(Request $request): RedirectResponse
    {
        $this->guard();

        $error = $this->regenerateMap();

        if ($error !== null) {
            return back()->with('error', $error);
        }

        return back()->with('success', 'Domain map regenerated.');
    }

    /**
     * Stream the raw JSON map (handy for diffing or piping into other tools).
     */
    public function download(): HttpResponse
    {
        $this->guard();

        $path = $this->mapPath();

        abort_unless(File::exists($path), HttpResponse::HTTP_NOT_FOUND, 'Domain map has not been generated yet.');

        return response()->file($path, ['Content-Type' => 'application/json']);
    }

    private function guard(): void
    {
        abort_unless(
            app()->environment(self::ALLOWED_ENVIRONMENTS),
            HttpResponse::HTTP_NOT_FOUND
        );
    }

    /**
     * @return string|null the failure message, or null on success
     */
    private function regenerateMap(): ?string
    {
        try {
            $this->generator->write($this->mapPath());

            return null;
        } catch (Throwable $exception) {
            report($exception);

            return 'Failed to generate the domain map: '.$exception->getMessage();
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function readMap(string $path): ?array
    {
        if (! File::exists($path)) {
            return null;
        }

        $decoded = json_decode((string) File::get($path), true);

        return is_array($decoded) ? $decoded : null;
    }

    private function mapPath(): string
    {
        return storage_path('app/'.DomainMapGenerator::OUTPUT_FILE);
    }

    /**
     * Build a URL next to the current one, so the page works whether it is
     * mounted at dev.<domain>/architecture or at /dev/architecture.
     */
    private function siblingUrl(Request $request, string $segment): string
    {
        return rtrim($request->getPathInfo(), '/').'/'.$segment;
    }
}
