<?php

declare(strict_types=1);

namespace App\Services\Dev;

use CurlHandle;

/**
 * Reads container names and logs straight from the Docker Engine API over the
 * mounted unix socket.
 *
 * Why the API and not `docker ps` / `docker logs`: the dev image has no docker
 * CLI, so shelling out would mean adding it to Dockerfile.dev and rebuilding.
 * The API needs nothing but the socket and PHP's curl, and it is a better fit
 * besides —
 *
 *   - no shell at all, so a container name can never be interpolated into a
 *     command line;
 *   - the attach stream is framed per chunk with its origin, so stdout and
 *     stderr stay distinguishable. `docker logs` interleaves them into one
 *     text stream, which would make the STDERR level unrecoverable.
 */
final class DockerLogReader
{
    /**
     * Pinned API version. Any engine from 2021 on serves this; asking for a
     * version the daemon predates is the one way to get a hard 400 back.
     */
    private const API_VERSION = 'v1.41';

    private const SOCKET = '/var/run/docker.sock';

    private const TIMEOUT_SECONDS = 5;

    /** Frame header the engine prefixes each non-TTY chunk with. */
    private const FRAME_HEADER_BYTES = 8;

    public function __construct(private readonly string $socket = self::SOCKET)
    {
    }

    /**
     * Whether the socket is mounted and the daemon answers.
     */
    public function available(): bool
    {
        if (! file_exists($this->socket)) {
            return false;
        }

        return $this->request('/_ping')['status'] === 200;
    }

    /**
     * Running containers, newest first.
     *
     * @return list<array{name: string, id: string, image: string, state: string, status: string, health: ?string}>
     */
    public function containers(): array
    {
        $response = $this->request('/containers/json');

        if ($response['status'] !== 200) {
            return [];
        }

        $decoded = json_decode($response['body'], true);

        if (! is_array($decoded)) {
            return [];
        }

        $containers = [];

        foreach ($decoded as $container) {
            if (! is_array($container)) {
                continue;
            }

            $name = ltrim((string) ($container['Names'][0] ?? ''), '/');

            if ($name === '') {
                continue;
            }

            $status = (string) ($container['Status'] ?? '');

            $containers[] = [
                'name' => $name,
                'id' => substr((string) ($container['Id'] ?? ''), 0, 12),
                'image' => (string) ($container['Image'] ?? ''),
                'state' => (string) ($container['State'] ?? 'unknown'),
                'status' => $status,
                // Compose health shows up only inside the status string.
                'health' => $this->healthFrom($status),
            ];
        }

        usort($containers, static fn (array $a, array $b): int => strcmp($a['name'], $b['name']));

        return $containers;
    }

    /**
     * Tail a container's combined output as frames tagged with their origin.
     *
     * @return list<array{stream: string, text: string}>
     */
    public function logs(string $container, int $tail = 200): array
    {
        $query = http_build_query([
            'stdout' => 'true',
            'stderr' => 'true',
            'timestamps' => 'true',
            'tail' => (string) max(1, min($tail, 2000)),
        ]);

        $response = $this->request('/containers/'.rawurlencode($container).'/logs?'.$query);

        if ($response['status'] !== 200) {
            return [];
        }

        return $this->demultiplex($response['body']);
    }

    /**
     * Split the engine's multiplexed attach stream into per-origin chunks.
     *
     * Each frame is an 8-byte header — stream type, three zero bytes, then a
     * big-endian uint32 payload length — followed by that many payload bytes.
     * A container started with a TTY writes raw text with no framing at all, so
     * fall back to treating the whole body as stdout when the first header does
     * not look like one.
     *
     * @return list<array{stream: string, text: string}>
     */
    private function demultiplex(string $body): array
    {
        if ($body === '') {
            return [];
        }

        $frames = [];
        $offset = 0;
        $length = strlen($body);

        while ($offset + self::FRAME_HEADER_BYTES <= $length) {
            $type = ord($body[$offset]);

            // 0 stdin, 1 stdout, 2 stderr. Anything else means this is not a
            // framed stream (TTY containers), so bail out and take it raw.
            if ($type > 2 || substr($body, $offset + 1, 3) !== "\0\0\0") {
                return [['stream' => 'stdout', 'text' => $body]];
            }

            $size = unpack('N', substr($body, $offset + 4, 4));

            if ($size === false) {
                break;
            }

            $payload = substr($body, $offset + self::FRAME_HEADER_BYTES, (int) $size[1]);

            $frames[] = [
                'stream' => $type === 2 ? 'stderr' : 'stdout',
                'text' => $payload,
            ];

            $offset += self::FRAME_HEADER_BYTES + (int) $size[1];
        }

        return $frames;
    }

    /**
     * "Up 2 hours (healthy)" => "healthy".
     */
    private function healthFrom(string $status): ?string
    {
        if (preg_match('/\((healthy|unhealthy|health: starting)\)/i', $status, $matches) === 1) {
            return strtolower($matches[1]);
        }

        return null;
    }

    /**
     * @return array{status: int, body: string}
     */
    private function request(string $path): array
    {
        $handle = curl_init();

        if (! $handle instanceof CurlHandle) {
            return ['status' => 0, 'body' => ''];
        }

        curl_setopt_array($handle, [
            CURLOPT_UNIX_SOCKET_PATH => $this->socket,
            CURLOPT_URL => 'http://localhost/'.self::API_VERSION.'/'.ltrim($path, '/'),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => self::TIMEOUT_SECONDS,
            CURLOPT_CONNECTTIMEOUT => self::TIMEOUT_SECONDS,
        ]);

        $body = curl_exec($handle);
        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);

        curl_close($handle);

        return [
            'status' => $status,
            'body' => is_string($body) ? $body : '',
        ];
    }
}
