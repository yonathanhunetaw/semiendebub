<?php

declare(strict_types=1);

namespace App\Services\Admin;

use Aws\CommandPool;
use Aws\ResultInterface;
use Aws\S3\S3Client;
use Illuminate\Contracts\Filesystem\Filesystem;

/**
 * The last 24 hours of every node, for the System page. Each node's scripts
 * (deploy/db-lib.sh uptime_publish) upload their per-minute samples as one small
 * object per hour, uptime/<node>/<YYYYMMDDTHH>.json:
 *
 *   {"node":"pi","hour":"20261018T07","from":<epoch>,"rows":[[ts, in_sync, db_up, tunnel, app_up, deploying, commit], ...]}
 *
 * The hours are fetched by key (no listing, so no list requests), folded into 5-minute
 * cells and judged per cell. A cell with no sample is never shown as up:
 *
 *   up / degraded (some minutes had the app or database down) / down / deploying
 *   off      no sample from an on-demand node (the Mac): expected, not an outage
 *   pending  the newest minutes of an online node, not uploaded yet (up to ~10 minutes)
 *   unknown  before the node's first recorded sample
 *
 * Read-only: the web app never writes to the bucket.
 */
class UptimeHistory
{
    public const STEP = 300;

    public const HOURS = 24;

    /** Samples are uploaded about every 10 minutes: newer cells of an online node are "pending", not "down". */
    private const UPLOAD_LAG = 900;

    public function __construct(private readonly Filesystem $disk)
    {
    }

    /**
     * @param  list<array<string, mixed>>  $nodes  the snapshot's nodes (name, role, on_demand, status, last_seen_age)
     * @return array<string, mixed>
     */
    public function build(array $nodes, ?int $now = null): array
    {
        $now ??= time();
        $cells = intdiv(self::HOURS * 3600, self::STEP);
        $start = intdiv($now, self::STEP) * self::STEP - ($cells - 1) * self::STEP;

        $result = [];
        $tunnelOn = array_fill(0, $cells, []);

        foreach ($nodes as $node) {
            // Node names come from the bucket and end up in object keys: only plain names.
            if (preg_match('/^[A-Za-z0-9._-]+$/', (string) $node['name']) !== 1) {
                continue;
            }

            $rows = $this->rows((string) $node['name'], $start, $now);
            $built = $this->node($node, $rows, $start, $cells, $now);

            foreach ($built['tunnel_cells'] as $i => $on) {
                if ($on) {
                    $tunnelOn[$i][] = (string) $node['name'];
                }
            }

            unset($built['tunnel_cells']);
            $result[] = $built;
        }

        return [
            'generated_at' => $now,
            'from' => $start,
            'step' => self::STEP,
            // Which node's Cloudflare tunnel was up in each cell: one name, 'multiple' (visitors split) or null.
            'live' => array_map(static fn (array $names): ?string => match (count($names)) {
                0 => null,
                1 => $names[0],
                default => 'multiple',
            }, $tunnelOn),
            'nodes' => $result,
        ];
    }

    /**
     * @param  array<string, mixed>  $node
     * @param  list<array{0: int, 1: bool, 2: bool, 3: string, 4: bool, 5: int, 6: string}>  $rows
     * @return array<string, mixed>
     */
    private function node(array $node, array $rows, int $start, int $cells, int $now): array
    {
        $onDemand = (bool) ($node['on_demand'] ?? false);
        $online = ($node['status'] ?? '') === 'online';
        $perCell = array_fill(0, $cells, []);

        foreach ($rows as $row) {
            $i = intdiv($row[0] - $start, self::STEP);
            if ($i >= 0 && $i < $cells) {
                $perCell[$i][] = $row;
            }
        }

        $first = null;
        $last = null;
        foreach ($perCell as $i => $cell) {
            if ($cell !== []) {
                $first ??= $i;
                $last = $i;
            }
        }

        $states = [];
        $tunnel = [];

        foreach ($perCell as $i => $cell) {
            $states[] = $this->cellState($cell, $i, $first, $last, $start, $onDemand, $online, $now);
            $tunnel[] = $cell !== [] && in_array('on', array_column($cell, 3), true);
        }

        $judged = array_filter($states, static fn (string $s): bool => in_array($s, ['up', 'degraded', 'down', 'deploying'], true));
        $good = count(array_filter($judged, static fn (string $s): bool => in_array($s, ['up', 'deploying'], true)));

        return [
            'name' => (string) $node['name'],
            'role' => (string) ($node['role'] ?? ''),
            'on_demand' => $onDemand,
            'cells' => $states,
            // Share of judged cells that were up. Null when nothing was recorded (or an on-demand node, off by design).
            'uptime_pct' => $judged === [] || $onDemand ? null : round($good / count($judged) * 100, 1),
            'outages' => $onDemand ? [] : $this->outages($states, $start, $now),
            'commits' => $this->commitChanges($rows),
            'samples' => count($rows),
            'tunnel_cells' => $tunnel,
        ];
    }

    /**
     * @param  list<array{0: int, 1: bool, 2: bool, 3: string, 4: bool, 5: int, 6: string}>  $cell
     */
    private function cellState(array $cell, int $i, ?int $first, ?int $last, int $start, bool $onDemand, bool $online, int $now): string
    {
        if ($cell !== []) {
            $bad = count(array_filter($cell, static fn (array $r): bool => ! $r[2] || ! $r[4]));

            return match (true) {
                count(array_filter($cell, static fn (array $r): bool => $r[5] > 0)) > 0 => 'deploying',
                $bad === count($cell) => 'down',
                $bad > 0 => 'degraded',
                default => 'up',
            };
        }

        if ($first === null || $i < $first) {
            // Nothing recorded yet (history only starts when the scripts were updated). An on-demand node is simply off.
            return $onDemand && $first !== null ? 'off' : 'unknown';
        }

        if ($onDemand) {
            return 'off';
        }

        // After the last uploaded sample: the newest minutes of a node that still reports are only late.
        if ($i > $last && $online && $start + $i * self::STEP >= $now - self::UPLOAD_LAG) {
            return 'pending';
        }

        return 'down';
    }

    /**
     * Runs of "down" cells, oldest first.
     *
     * @param  list<string>  $states
     * @return list<array{from: int, minutes: int, ongoing: bool}>
     */
    private function outages(array $states, int $start, int $now): array
    {
        $out = [];
        $run = null;

        foreach ($states as $i => $state) {
            if ($state === 'down') {
                $run ??= $i;
            } elseif ($run !== null) {
                $out[] = ['from' => $start + $run * self::STEP, 'minutes' => ($i - $run) * intdiv(self::STEP, 60), 'ongoing' => false];
                $run = null;
            }
        }

        if ($run !== null) {
            $out[] = ['from' => $start + $run * self::STEP, 'minutes' => (count($states) - $run) * intdiv(self::STEP, 60), 'ongoing' => true];
        }

        return $out;
    }

    /**
     * @param  list<array{0: int, 1: bool, 2: bool, 3: string, 4: bool, 5: int, 6: string}>  $rows
     * @return list<array{ts: int, from: string, to: string}>
     */
    private function commitChanges(array $rows): array
    {
        $out = [];
        $prev = null;

        foreach ($rows as $row) {
            if ($row[6] !== '' && $prev !== null && $row[6] !== $prev) {
                $out[] = ['ts' => $row[0], 'from' => $prev, 'to' => $row[6]];
            }
            if ($row[6] !== '') {
                $prev = $row[6];
            }
        }

        return $out;
    }

    // ---- reading the bucket ------------------------------------------------

    /**
     * Every sample of the window, oldest first.
     *
     * @return list<array{0: int, 1: bool, 2: bool, 3: string, 4: bool, 5: int, 6: string}>
     */
    private function rows(string $node, int $start, int $now): array
    {
        $keys = [];
        for ($hour = intdiv($start, 3600) * 3600; $hour <= $now; $hour += 3600) {
            $keys[] = 'uptime/'.$node.'/'.gmdate('Ymd\TH', $hour).'.json';
        }

        $rows = [];

        foreach ($this->fetch($keys) as $object) {
            foreach ((array) ($object['rows'] ?? []) as $r) {
                if (is_array($r) && count($r) >= 6 && is_numeric($r[0]) && $r[0] >= $start && $r[0] <= $now) {
                    $rows[] = [(int) $r[0], (bool) $r[1], (bool) $r[2], (string) $r[3], (bool) $r[4], (int) $r[5], (string) ($r[6] ?? '')];
                }
            }
        }

        usort($rows, static fn (array $a, array $b): int => $a[0] <=> $b[0]);

        return $rows;
    }

    /**
     * @param  list<string>  $keys
     * @return list<array<string, mixed>>
     */
    private function fetch(array $keys): array
    {
        $client = method_exists($this->disk, 'getClient') ? $this->disk->getClient() : null;
        $out = [];

        if (! $client instanceof S3Client) {
            foreach ($keys as $key) {
                $raw = $this->disk->get($key);
                $data = is_string($raw) ? json_decode($raw, true) : null;
                if (is_array($data)) {
                    $out[] = $data;
                }
            }

            return $out;
        }

        // Up to 25 small objects per node; the hours that do not exist (yet) answer 404 and are skipped.
        $bucket = (string) config('filesystems.disks.backup_r2.bucket');
        $commands = [];
        foreach ($keys as $key) {
            $commands[$key] = $client->getCommand('GetObject', ['Bucket' => $bucket, 'Key' => $key]);
        }

        foreach (CommandPool::batch($client, $commands, ['concurrency' => 15]) as $result) {
            $data = $result instanceof ResultInterface ? json_decode((string) $result['Body'], true) : null;
            if (is_array($data)) {
                $out[] = $data;
            }
        }

        return $out;
    }
}
