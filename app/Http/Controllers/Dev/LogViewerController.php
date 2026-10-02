<?php

declare(strict_types=1);

namespace App\Http\Controllers\Dev;

use App\Http\Controllers\Controller;
use App\Services\Dev\DockerLogReader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Live log viewer for the three layers a local stack writes to:
 *
 *   1. Laravel App    — storage/logs/{laravel,auth-*,observability-*}.log
 *   2. Deploy Runs    — logs/deploy_*.log written by deploy.sh
 *   3. Docker         — stdout/stderr of whatever containers are up
 *
 * Security shape, since this reads arbitrary-looking identifiers off the wire:
 * nothing the client sends is ever used as a path or a shell word. Both file
 * and container identifiers are matched against the freshly-enumerated source
 * list and rejected unless they are already in it, so traversal
 * ("../../.env") and injection ("db; rm -rf /") cannot express anything.
 * Every action also 404s outside local/development.
 */
final class LogViewerController extends Controller
{
    /**
     * @var list<string>
     */
    private const ALLOWED_ENVIRONMENTS = ['local', 'development', 'testing'];

    /** Lines returned per fetch. */
    private const TAIL_LINES = 300;

    /** Files above this are tailed from the end rather than read whole. */
    private const TAIL_BYTES = 512 * 1024;

    public function __construct(private readonly DockerLogReader $docker)
    {
    }

    public function index(): Response
    {
        $this->guard();

        $sources = $this->sources();

        return Inertia::render('Dev/Logs/index', [
            'categories' => $sources['categories'],
            'docker' => [
                'available' => $sources['docker_available'],
                'hint' => $sources['docker_available']
                    ? null
                    : 'Docker socket not reachable at /var/run/docker.sock. Add the dev-compose mount and recreate the container.',
            ],
        ]);
    }

    /**
     * Return parsed entries for one source. Polled by the page.
     */
    public function fetch(Request $request): JsonResponse
    {
        $this->guard();

        $validated = $request->validate([
            'source_type' => ['required', 'string', 'in:file,container'],
            'identifier' => ['required', 'string', 'max:512'],
        ]);

        $type = $validated['source_type'];
        $identifier = $validated['identifier'];

        $source = $this->resolve($type, $identifier);

        abort_if($source === null, HttpResponse::HTTP_NOT_FOUND, 'Unknown log source.');

        $entries = $type === 'container'
            ? $this->containerEntries($identifier)
            : $this->fileEntries((string) $source['path']);

        return response()->json([
            'identifier' => $identifier,
            'source_type' => $type,
            'entries' => $entries,
            'meta' => [
                'count' => count($entries),
                'fetched_at' => now()->toIso8601String(),
                'size' => $source['size'] ?? null,
                'writable' => (bool) ($source['writable'] ?? false),
            ],
        ]);
    }

    /**
     * Truncate a writable log file. Container streams are owned by the daemon,
     * so there is nothing to clear and the request is refused rather than
     * silently doing nothing.
     */
    public function clear(Request $request): RedirectResponse
    {
        $this->guard();

        $validated = $request->validate([
            'source_type' => ['required', 'string', 'in:file,container'],
            'identifier' => ['required', 'string', 'max:512'],
        ]);

        if ($validated['source_type'] === 'container') {
            return back()->with('error', 'Container streams are managed by Docker and cannot be cleared here.');
        }

        $source = $this->resolve('file', $validated['identifier']);

        abort_if($source === null, HttpResponse::HTTP_NOT_FOUND, 'Unknown log source.');

        if (! ($source['writable'] ?? false)) {
            return back()->with('error', 'That log file is not writable.');
        }

        file_put_contents((string) $source['path'], '');

        return back()->with('success', $validated['identifier'].' truncated.');
    }

    /**
     * Every readable source, grouped for the UI.
     *
     * @return array{categories: list<array<string, mixed>>, docker_available: bool, index: array<string, array<string, mixed>>}
     */
    private function sources(): array
    {
        $laravel = $this->filesIn(storage_path('logs'), 'storage/logs');
        $deploy = $this->filesIn(base_path('logs'), 'logs');

        $dockerAvailable = $this->docker->available();
        $containers = $dockerAvailable ? $this->docker->containers() : [];

        $containerSources = array_map(static fn (array $container): array => [
            'id' => $container['name'],
            'label' => $container['name'],
            'source_type' => 'container',
            'identifier' => $container['name'],
            'detail' => $container['image'],
            'state' => $container['state'],
            'status' => $container['status'],
            'health' => $container['health'],
            'writable' => false,
            'size' => null,
            'modified_at' => null,
        ], $containers);

        $categories = [
            [
                'key' => 'laravel',
                'label' => 'Laravel App',
                'description' => 'Application, auth and observability channels',
                'sources' => $laravel['sources'],
            ],
            [
                'key' => 'deploy',
                'label' => 'Deployment Runs',
                'description' => 'deploy.sh transcripts, newest first',
                'sources' => $deploy['sources'],
            ],
            [
                'key' => 'docker',
                'label' => 'Docker Containers',
                'description' => 'Live stdout and stderr per container',
                'sources' => $containerSources,
            ],
        ];

        $index = $laravel['index'] + $deploy['index'];

        foreach ($containerSources as $source) {
            $index['container:'.$source['identifier']] = $source;
        }

        return [
            'categories' => $categories,
            'docker_available' => $dockerAvailable,
            'index' => $index,
        ];
    }

    /**
     * Log files directly inside one directory, newest first.
     *
     * Not recursive and extension-locked on purpose: the listing itself is the
     * allowlist that resolve() checks against, so anything it would not show is
     * also something it will not open.
     *
     * @return array{sources: list<array<string, mixed>>, index: array<string, array<string, mixed>>}
     */
    private function filesIn(string $directory, string $label): array
    {
        if (! is_dir($directory)) {
            return ['sources' => [], 'index' => []];
        }

        $real = realpath($directory);

        if ($real === false) {
            return ['sources' => [], 'index' => []];
        }

        $sources = [];
        $index = [];

        foreach ((array) glob($real.'/*.log') as $path) {
            if (! is_string($path) || ! is_file($path) || is_link($path)) {
                continue;
            }

            // Belt and braces: the glob cannot escape $real, but confirm anyway.
            $resolved = realpath($path);

            if ($resolved === false || ! str_starts_with($resolved, $real.DIRECTORY_SEPARATOR)) {
                continue;
            }

            $name = basename($resolved);
            $identifier = $label.'/'.$name;

            $source = [
                'id' => $identifier,
                'label' => $name,
                'source_type' => 'file',
                'identifier' => $identifier,
                'detail' => $label,
                'path' => $resolved,
                'size' => filesize($resolved) ?: 0,
                'modified_at' => now()->setTimestamp((int) filemtime($resolved))->toIso8601String(),
                'writable' => is_writable($resolved),
                'state' => null,
                'status' => null,
                'health' => null,
            ];

            $sources[] = $source;
            $index['file:'.$identifier] = $source;
        }

        usort($sources, static fn (array $a, array $b): int => strcmp((string) $b['modified_at'], (string) $a['modified_at']));

        // `path` is server-only; never ship absolute paths to the client.
        $public = array_map(
            static fn (array $source): array => array_diff_key($source, ['path' => null]),
            $sources
        );

        return ['sources' => $public, 'index' => $index];
    }

    /**
     * Look an identifier up in the live source list. Null means "not a source",
     * which is the only answer the rest of the controller acts on.
     *
     * @return array<string, mixed>|null
     */
    private function resolve(string $type, string $identifier): ?array
    {
        return $this->sources()['index'][$type.':'.$identifier] ?? null;
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function containerEntries(string $container): array
    {
        $entries = [];
        $sequence = 0;

        foreach ($this->docker->logs($container, self::TAIL_LINES) as $frame) {
            foreach (preg_split('/\r?\n/', $frame['text']) ?: [] as $line) {
                $line = $this->stripAnsi(rtrim($line, "\r"));

                if (trim($line) === '') {
                    continue;
                }

                // The engine prefixes every line with an RFC3339Nano stamp.
                $timestamp = null;

                if (preg_match('/^(\S+?Z|\S+?[+-]\d{2}:\d{2})\s+(.*)$/s', $line, $matches) === 1) {
                    $timestamp = $matches[1];
                    $line = $matches[2];
                }

                $entries[] = [
                    'id' => $sequence++,
                    'timestamp' => $timestamp,
                    'level' => $frame['stream'] === 'stderr' ? 'STDERR' : $this->levelFrom($line),
                    'channel' => $frame['stream'],
                    'message' => $line,
                    'trace' => null,
                ];
            }
        }

        return $entries;
    }

    /**
     * Parse a log file's tail into structured entries.
     *
     * Handles both formats this project writes:
     *   Laravel  [2026-10-02 00:45:20] testing.DEBUG: message {json}
     *   deploy   [2026-09-12 08:20:03] [SUCCESS] message
     *
     * Continuation lines (stack frames, "#0 /app/...") attach to the entry
     * above them rather than becoming entries of their own.
     *
     * @return list<array<string, mixed>>
     */
    private function fileEntries(string $path): array
    {
        $contents = $this->tail($path, self::TAIL_BYTES);

        if ($contents === '') {
            return [];
        }

        $entries = [];
        $sequence = 0;

        foreach (preg_split('/\r?\n/', $contents) ?: [] as $line) {
            $line = $this->stripAnsi(rtrim($line, "\r"));

            if (trim($line) === '') {
                continue;
            }

            // Laravel: [date] channel.LEVEL: message
            if (preg_match('/^\[(.+?)\]\s+([a-z0-9_.\-]+)\.([A-Z]+):\s*(.*)$/s', $line, $matches) === 1) {
                $entries[] = [
                    'id' => $sequence++,
                    'timestamp' => $matches[1],
                    'level' => strtoupper($matches[3]),
                    'channel' => $matches[2],
                    'message' => $matches[4],
                    'trace' => null,
                ];

                continue;
            }

            // deploy.sh: [date] [LEVEL] message
            if (preg_match('/^\[(.+?)\]\s+\[([A-Z]+)\]\s*(.*)$/s', $line, $matches) === 1) {
                $entries[] = [
                    'id' => $sequence++,
                    'timestamp' => $matches[1],
                    'level' => strtoupper($matches[2]),
                    'channel' => 'deploy',
                    'message' => $matches[3],
                    'trace' => null,
                ];

                continue;
            }

            // Continuation of whatever came before — a stack frame or wrapped text.
            if ($entries !== []) {
                $last = count($entries) - 1;
                $entries[$last]['trace'] = ($entries[$last]['trace'] ?? '') === ''
                    ? $line
                    : $entries[$last]['trace']."\n".$line;

                continue;
            }

            $entries[] = [
                'id' => $sequence++,
                'timestamp' => null,
                'level' => $this->levelFrom($line),
                'channel' => null,
                'message' => $line,
                'trace' => null,
            ];
        }

        return array_values(array_slice($entries, -self::TAIL_LINES));
    }

    /**
     * Last $bytes of a file, dropping the partial first line.
     *
     * laravel.log runs to megabytes; reading it whole to show 300 lines would
     * exhaust memory on the poll loop.
     */
    private function tail(string $path, int $bytes): string
    {
        $size = filesize($path);

        if ($size === false || $size === 0) {
            return '';
        }

        $handle = fopen($path, 'rb');

        if ($handle === false) {
            return '';
        }

        if ($size > $bytes) {
            fseek($handle, -$bytes, SEEK_END);
            fgets($handle);
        }

        $contents = stream_get_contents($handle) ?: '';

        fclose($handle);

        return $contents;
    }

    /**
     * Best-effort level for a line that carries no explicit one.
     */
    private function levelFrom(string $line): string
    {
        return match (true) {
            preg_match('/\b(emergency|alert|critical|fatal|error)\b/i', $line) === 1 => 'ERROR',
            preg_match('/\b(warning|warn|deprecated)\b/i', $line) === 1 => 'WARNING',
            preg_match('/\b(debug|trace)\b/i', $line) === 1 => 'DEBUG',
            default => 'INFO',
        };
    }

    /**
     * Drop ANSI colour and cursor sequences — deploy.sh and most container
     * entrypoints colourise their output.
     */
    private function stripAnsi(string $value): string
    {
        return (string) preg_replace('/\x1B(?:[@-Z\\\\-_]|\[[0-?]*[ -\/]*[@-~])/', '', $value);
    }

    private function guard(): void
    {
        abort_unless(
            app()->environment(self::ALLOWED_ENVIRONMENTS),
            HttpResponse::HTTP_NOT_FOUND
        );
    }
}
