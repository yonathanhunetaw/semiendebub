<?php

declare(strict_types=1);

namespace App\Services\Admin;

use Illuminate\Contracts\Filesystem\Filesystem;

/**
 * Containers and machine resources per node, for the System page. Read-only: each
 * node's scripts (deploy/node-stats.sh) write stats/<node>.json every ~5 minutes with
 * fixed read-only commands (docker ps/inspect/stats, df, /proc). The web app never
 * connects to a server and never writes to the bucket.
 *
 * The file holds three raw docker lists that are joined here by container name:
 *   ps      [name, image, state, status]
 *   inspect [name, restart_count, started_at, health]
 *   stats   [name, "12.5%", "512.3MiB / 3.7GiB"]   (running containers only)
 */
class NodeStats
{
    /** Older than this and the numbers are shown as stale (a node reports every ~5 minutes). */
    public const STALE_SECONDS = 900;

    public const DISK_WARN = 85;

    public const DISK_ERROR = 95;

    public const MEMORY_WARN_AVAILABLE_PCT = 10;

    public const TEMP_WARN = 80;

    public const TEMP_ERROR = 85;

    private const UNITS = ['b' => 1, 'kb' => 1000, 'kib' => 1024, 'mb' => 1000 ** 2, 'mib' => 1024 ** 2, 'gb' => 1000 ** 3, 'gib' => 1024 ** 3, 'tb' => 1000 ** 4, 'tib' => 1024 ** 4];

    public function __construct(private readonly Filesystem $disk)
    {
    }

    /**
     * @param  list<array<string, mixed>>  $nodes  the snapshot's nodes (name, status)
     * @return array{nodes: list<array<string, mixed>>, alerts: list<array{level: string, message: string}>}
     */
    public function build(array $nodes, int $now): array
    {
        $out = [];
        $alerts = [];

        foreach ($nodes as $node) {
            $name = (string) $node['name'];

            // Node names come from the bucket and end up in an object key: only plain names.
            if (preg_match('/^[A-Za-z0-9._-]+$/', $name) !== 1) {
                continue;
            }

            $raw = $this->disk->get('stats/'.$name.'.json');
            $json = is_string($raw) ? json_decode($raw, true) : null;
            $entry = is_array($json) ? $this->node($name, $json, $now) : ['name' => $name, 'reported' => false];

            $out[] = $entry;

            if (($node['status'] ?? '') === 'online' && ($entry['reported'] ?? false) && ! $entry['stale']) {
                array_push($alerts, ...$this->alerts($entry));
            }
        }

        return ['nodes' => $out, 'alerts' => $alerts];
    }

    /**
     * @param  array<string, mixed>  $json
     * @return array<string, mixed>
     */
    private function node(string $name, array $json, int $now): array
    {
        $age = max(0, $now - (int) ($json['ts'] ?? 0));

        return [
            'name' => $name,
            'reported' => true,
            'age' => $age,
            'stale' => $age >= self::STALE_SECONDS,
            'docker_ok' => (bool) ($json['docker_ok'] ?? false),
            'host' => $this->host((array) ($json['host'] ?? [])),
            'containers' => $this->containers($json, $now),
        ];
    }

    /**
     * @param  array<string, mixed>  $h
     * @return array<string, mixed>
     */
    private function host(array $h): array
    {
        $cpus = max(1, (int) ($h['cpus'] ?? 1));
        $load = array_map(static fn ($v): float => round((float) $v, 2), array_slice(array_values((array) ($h['load'] ?? [0, 0, 0])), 0, 3));
        $load = array_pad($load, 3, 0.0);
        $total = max(0, (int) ($h['mem_total_kb'] ?? 0)) * 1024;
        $avail = min($total, max(0, (int) ($h['mem_avail_kb'] ?? 0)) * 1024);
        $temp = $h['temp_c'] ?? null;

        $disks = [];
        foreach ((array) ($h['disks'] ?? []) as $d) {
            if (is_array($d) && count($d) >= 3 && (int) $d[1] > 0) {
                $disks[] = [
                    'mount' => (string) $d[0],
                    'total' => (int) $d[1] * 1024,
                    'used' => (int) $d[2] * 1024,
                    'pct' => (int) round((int) $d[2] / (int) $d[1] * 100),
                ];
            }
        }

        return [
            'cpus' => $cpus,
            'load' => $load,
            'load_pct' => (int) round($load[0] / $cpus * 100),
            'mem_total' => $total,
            'mem_used' => $total - $avail,
            'mem_pct' => $total > 0 ? (int) round(($total - $avail) / $total * 100) : null,
            'uptime' => max(0, (int) ($h['uptime_s'] ?? 0)),
            'temp_c' => is_numeric($temp) ? (int) $temp : null,
            'disks' => $disks,
        ];
    }

    /**
     * Running containers first (busiest first), then the rest by name.
     *
     * @param  array<string, mixed>  $json
     * @return list<array<string, mixed>>
     */
    private function containers(array $json, int $now): array
    {
        $inspect = [];
        foreach ((array) ($json['inspect'] ?? []) as $r) {
            if (is_array($r) && isset($r[0])) {
                $inspect[(string) $r[0]] = $r;
            }
        }

        $stats = [];
        foreach ((array) ($json['stats'] ?? []) as $r) {
            if (is_array($r) && isset($r[0])) {
                $stats[(string) $r[0]] = $r;
            }
        }

        $out = [];

        foreach ((array) ($json['ps'] ?? []) as $r) {
            if (! is_array($r) || ! isset($r[0])) {
                continue;
            }

            $name = (string) $r[0];
            $state = (string) ($r[2] ?? '');
            $status = (string) ($r[3] ?? '');
            $i = $inspect[$name] ?? [];
            $s = $stats[$name] ?? null;
            $started = isset($i[2]) && is_string($i[2]) && ! str_starts_with($i[2], '0001') ? strtotime($i[2]) : false;
            $health = (string) ($i[3] ?? '');

            if ($health === '' && preg_match('/\((healthy|unhealthy|health: starting)\)/', $status, $m) === 1) {
                $health = $m[1] === 'health: starting' ? 'starting' : $m[1];
            }

            $out[] = [
                'name' => $name,
                'image' => (string) ($r[1] ?? ''),
                'state' => $state,
                'status' => $status,
                'health' => in_array($health, ['healthy', 'unhealthy', 'starting'], true) ? $health : '',
                'restarts' => max(0, (int) ($i[1] ?? 0)),
                'uptime' => $state === 'running' && $started !== false ? max(0, $now - $started) : null,
                'cpu' => $s !== null ? round((float) rtrim((string) ($s[1] ?? '0'), '%'), 1) : null,
                'mem' => $s !== null ? $this->bytes((string) ($s[2] ?? '')) : null,
            ];
        }

        usort($out, static fn (array $a, array $b): int => [$a['state'] !== 'running', -($a['mem'] ?? 0), $a['name']] <=> [$b['state'] !== 'running', -($b['mem'] ?? 0), $b['name']]);

        return $out;
    }

    /** "512.3MiB / 3.7GiB" -> bytes of the first number; null when it cannot be read. */
    private function bytes(string $usage): ?int
    {
        if (preg_match('/^\s*([\d.]+)\s*([A-Za-z]+)/', $usage, $m) !== 1) {
            return null;
        }

        $unit = self::UNITS[strtolower($m[2])] ?? null;

        return $unit === null ? null : (int) round((float) $m[1] * $unit);
    }

    /**
     * Things that need a person: a nearly full disk, no memory left, a hot machine, a container in trouble.
     * A stopped container is not one: old stopped ones are normal.
     *
     * @param  array<string, mixed>  $e
     * @return list<array{level: string, message: string}>
     */
    private function alerts(array $e): array
    {
        $alerts = [];
        $name = $e['name'];
        $host = $e['host'];

        foreach ($host['disks'] as $d) {
            if ($d['pct'] >= self::DISK_WARN) {
                $alerts[] = ['level' => $d['pct'] >= self::DISK_ERROR ? 'error' : 'warn', 'message' => "{$name}'s disk {$d['mount']} is {$d['pct']}% full."];
            }
        }

        if ($host['mem_pct'] !== null && 100 - $host['mem_pct'] < self::MEMORY_WARN_AVAILABLE_PCT) {
            $alerts[] = ['level' => 'warn', 'message' => "{$name} has under ".self::MEMORY_WARN_AVAILABLE_PCT.'% of its memory left.'];
        }

        if ($host['temp_c'] !== null && $host['temp_c'] >= self::TEMP_WARN) {
            $alerts[] = ['level' => $host['temp_c'] >= self::TEMP_ERROR ? 'error' : 'warn', 'message' => "{$name} is running hot: {$host['temp_c']}°C."];
        }

        foreach ($e['containers'] as $c) {
            if ($c['state'] === 'restarting' || $c['state'] === 'dead') {
                $alerts[] = ['level' => 'error', 'message' => "Container {$c['name']} on {$name} is {$c['state']}."];
            } elseif ($c['state'] === 'running' && $c['health'] === 'unhealthy') {
                $alerts[] = ['level' => 'error', 'message' => "Container {$c['name']} on {$name} reports unhealthy."];
            }
        }

        return $alerts;
    }
}
