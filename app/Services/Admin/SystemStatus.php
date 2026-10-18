<?php

declare(strict_types=1);

namespace App\Services\Admin;

use Aws\CommandPool;
use Aws\S3\S3Client;
use Illuminate\Contracts\Filesystem\Filesystem;

/**
 * What the admin "System status" page shows: which node is live, how the other
 * nodes are doing, what happened lately, and whether a hand-over may have cost
 * data. Everything is READ from the backup bucket, where the scripts in
 * docker/ and deploy/ write the lease (primary.json), the newest backup
 * (latest.json), the deployed commit (deployed.json), one heartbeat per node
 * (nodes/), one small file per event (events/) and a resource snapshot per node
 * (stats/, read by NodeStats). The web app never writes.
 *
 * A node counts as online when its heartbeat is younger than ONLINE_SECONDS
 * (the sync job writes one every minute); older than STALE_SECONDS is offline.
 */
class SystemStatus
{
    public const ONLINE_SECONDS = 150;

    public const STALE_SECONDS = 900;

    /** A deploy mark older than this is ignored, as the scripts do (DEPLOY_GRACE_SEC in deploy/db-lib.sh). */
    public const DEPLOY_GRACE_SECONDS = 1200;

    public const EVENT_LIMIT = 80;

    /** A standby that has been behind the newest backup this long (or failed this many restores in a row) raises an alert. */
    public const BEHIND_ALERT_SECONDS = 600;

    public const RESTORE_FAILURES_ALERT = 3;

    private const DAYS_LISTED = 3;

    public function __construct(private readonly Filesystem $disk)
    {
    }

    /**
     * @return array<string, mixed>
     */
    public function snapshot(?int $now = null): array
    {
        $now ??= time();

        $lease = $this->lease($now);
        $latest = $this->json('latest.json');
        $deployed = $this->json('deployed.json');
        $nodes = $this->nodes($now, $lease);
        $events = $this->events($now);
        $dataEvents = $this->dataReplacedEvents($now);
        $resources = (new NodeStats($this->disk))->build($nodes, $now);

        return [
            'now' => $now,
            'empty' => $lease === null && $latest === null && $deployed === null && $nodes === [] && $events === [],
            'this_node' => [
                'name' => (string) config('system_status.node_name'),
                'role' => (string) config('system_status.node_role'),
            ],
            'lease' => $lease,
            'live_node' => $lease !== null && $lease['fresh'] ? $lease['node'] : null,
            'latest_backup' => $latest === null ? null : [
                'file' => (string) ($latest['file'] ?? ''),
                'node' => (string) ($latest['node'] ?? ''),
                'time' => (string) ($latest['time'] ?? ''),
                'bytes' => (int) ($latest['bytes'] ?? 0),
                'age' => $this->age($latest['time'] ?? null, $now),
            ],
            'deployed' => $deployed === null ? null : [
                'commit' => (string) ($deployed['commit'] ?? ''),
                'node' => (string) ($deployed['node'] ?? ''),
                'time' => (string) ($deployed['time'] ?? ''),
            ],
            'nodes' => $nodes,
            'alerts' => [...$this->alerts($lease, $latest, $nodes, $dataEvents, $now), ...$resources['alerts']],
            // Containers and machine resources per node (stats/<node>.json, see NodeStats).
            'resources' => $resources['nodes'],
            'data_events' => $dataEvents,
            'events' => $events,
        ];
    }

    /**
     * @return array{node: string, age: int, ttl: int, pinned: bool, fresh: bool}|null
     */
    private function lease(int $now): ?array
    {
        $json = $this->json('primary.json');

        if ($json === null) {
            return null;
        }

        $ts = (int) ($json['ts'] ?? 0);
        $ttl = (int) ($json['ttl'] ?? 0);
        $ttl = $ttl > 0 ? $ttl : 900;
        $node = (string) ($json['node'] ?? '');
        $age = max(0, $now - $ts);

        return [
            'node' => $node,
            'age' => $age,
            'ttl' => $ttl,
            'pinned' => (bool) ($json['pinned'] ?? false),
            'fresh' => $node !== '' && $age < $ttl,
        ];
    }

    /**
     * @param  array{node: string, fresh: bool}|null  $lease
     * @return list<array<string, mixed>>
     */
    private function nodes(int $now, ?array $lease): array
    {
        $out = [];

        foreach ($this->keys('nodes/') as $key) {
            $beat = $this->json($key);

            if ($beat === null || ! isset($beat['node'])) {
                continue;
            }

            $age = max(0, $now - (int) ($beat['ts'] ?? 0));
            $onDemand = (bool) ($beat['on_demand'] ?? false);
            $dbUp = (bool) ($beat['db_up'] ?? true);

            $status = match (true) {
                $onDemand && ! $dbUp => 'off',
                $age < self::ONLINE_SECONDS => 'online',
                $age < self::STALE_SECONDS => 'stale',
                default => 'offline',
            };

            $name = (string) $beat['node'];

            // From deploy/deploy.sh: the epoch its running deploy started, 0 = none.
            $deploying = (int) ($beat['deploying'] ?? 0);
            $deployingAge = $deploying > 0 ? max(0, $now - $deploying) : null;
            if ($deployingAge !== null && $deployingAge >= self::DEPLOY_GRACE_SECONDS) {
                $deployingAge = null;
            }

            $out[] = [
                'name' => $name,
                'role' => (string) ($beat['role'] ?? ''),
                'on_demand' => $onDemand,
                'commit' => (string) ($beat['commit'] ?? ''),
                'in_sync' => (bool) ($beat['in_sync'] ?? false),
                'db_up' => $dbUp,
                // From docker/tunnel-guard.sh: 'on' / 'off', '' when the guard does not run there.
                'tunnel' => in_array($beat['tunnel'] ?? '', ['on', 'off'], true) ? (string) $beat['tunnel'] : '',
                'app_up' => (bool) ($beat['app_up'] ?? true),
                'deploying' => $deployingAge !== null,
                'deploying_age' => $deployingAge,
                'last_seen_age' => $age,
                'status' => $status,
                'is_live' => $lease !== null && $lease['fresh'] && $lease['node'] === $name,
            ] + $this->syncFields($beat, $now);
        }

        usort($out, static fn (array $a, array $b): int => [! $a['is_live'], $a['name']] <=> [! $b['is_live'], $b['name']]);

        return $out;
    }

    /**
     * The heartbeat's sync fields (docker/sync-db.sh, deploy/db-lib.sh heartbeat_write).
     * Older heartbeats lack them: every field then reads as unknown (null) or zero.
     *
     * @param  array<string, mixed>  $beat
     * @return array<string, mixed>
     */
    private function syncFields(array $beat, int $now): array
    {
        $since = static fn (mixed $epoch): ?int => (int) $epoch > 0 ? max(0, $now - (int) $epoch) : null;
        $changed = $beat['tables_changed'] ?? null;

        return [
            'behind_for' => $since($beat['behind_since'] ?? 0),
            'last_restore_age' => $since($beat['last_restore_ok'] ?? 0),
            'restore_failures' => max(0, (int) ($beat['restore_failures'] ?? 0)),
            'last_backup_age' => $since($beat['last_backup_ts'] ?? 0),
            // Age of the dump or restore the node last started from: writes after it are not in any backup yet.
            'dump_age' => $since($beat['baseline_ts'] ?? 0),
            // null = the node could not ask its database (or runs old scripts).
            'tables_changed' => is_array($changed) ? [
                'count' => max(0, (int) ($changed['count'] ?? 0)),
                'names' => array_values(array_filter((array) ($changed['names'] ?? []), 'is_string')),
            ] : null,
        ];
    }

    /**
     * The newest events, newest first.
     *
     * @return list<array<string, mixed>>
     */
    private function events(int $now): array
    {
        $keys = $this->eventKeys();
        rsort($keys);

        return $this->shape($this->fetchAll(array_slice($keys, 0, self::EVENT_LIMIT)), $now);
    }

    /**
     * Every hand-over that replaced a node's data in the last 30 days, newest first.
     *
     * @return list<array<string, mixed>>
     */
    private function dataReplacedEvents(int $now): array
    {
        $keys = array_values(array_filter($this->eventKeys(30), static fn (string $k): bool => str_contains($k, '_data_replaced_')));
        rsort($keys);

        return $this->shape($this->fetchAll(array_slice($keys, 0, 30)), $now);
    }

    /**
     * @param  list<array<string, mixed>>  $events
     * @return list<array<string, mixed>>
     */
    private function shape(array $events, int $now): array
    {
        return array_values(array_map(static fn (array $e): array => [
            'time' => (string) ($e['time'] ?? ''),
            'ts' => (int) ($e['ts'] ?? 0),
            'age' => max(0, $now - (int) ($e['ts'] ?? 0)),
            'node' => (string) ($e['node'] ?? ''),
            'role' => (string) ($e['role'] ?? ''),
            'type' => (string) ($e['type'] ?? ''),
            'level' => in_array($e['level'] ?? 'info', ['info', 'warn', 'error'], true) ? (string) $e['level'] : 'info',
            'message' => (string) ($e['message'] ?? ''),
            'data' => is_array($e['data'] ?? null) ? $e['data'] : [],
        ], $events));
    }

    /**
     * Things that need a person's attention, most serious first.
     *
     * @param  array{node: string, age: int, fresh: bool, pinned: bool}|null  $lease
     * @param  array<string, mixed>|null  $latest
     * @param  list<array<string, mixed>>  $nodes
     * @param  list<array<string, mixed>>  $dataEvents
     * @return list<array{level: string, message: string}>
     */
    private function alerts(?array $lease, ?array $latest, array $nodes, array $dataEvents, int $now): array
    {
        $alerts = [];

        if ($lease === null || $lease['node'] === '') {
            $alerts[] = ['level' => 'warn', 'message' => 'No node holds the primary lease. The next backup job to run will take it.'];
        } elseif (! $lease['fresh']) {
            $alerts[] = ['level' => 'error', 'message' => "The lease held by {$lease['node']} expired {$lease['age']}s after its last refresh: that node may be down."];
        }

        foreach ($nodes as $node) {
            if ($node['status'] === 'offline') {
                $alerts[] = ['level' => 'warn', 'message' => "{$node['name']} has not reported for over ".intdiv(self::STALE_SECONDS, 60).' minutes.'];
            } elseif ($node['status'] === 'online' && ! $node['in_sync'] && ! $node['is_live']) {
                $alerts[] = match (true) {
                    $node['restore_failures'] >= self::RESTORE_FAILURES_ALERT => ['level' => 'error', 'message' => "{$node['name']} has failed to restore the newest backup {$node['restore_failures']} times in a row: it is falling behind. Check its sync log."],
                    ($node['behind_for'] ?? 0) >= self::BEHIND_ALERT_SECONDS => ['level' => 'warn', 'message' => "{$node['name']} has been behind the newest backup for ".intdiv($node['behind_for'], 60).' minutes.'],
                    default => ['level' => 'warn', 'message' => "{$node['name']} is online but its data does not match the newest backup yet."],
                };
            }

            // Writes the live node made after its last dump are in no backup. Normal for a few
            // minutes; a long gap means backups stopped while the shop keeps writing.
            if ($node['status'] === 'online' && $node['is_live'] && ($node['tables_changed']['count'] ?? 0) > 0 && ($node['dump_age'] ?? 0) > 900) {
                $alerts[] = ['level' => 'warn', 'message' => "{$node['name']} has written to {$node['tables_changed']['count']} table(s) since its last dump ".intdiv($node['dump_age'], 60).' minutes ago: those changes are in no backup yet.'];
            }
        }

        // Cloudflare spreads visitors over every connected tunnel replica: two up at
        // once means random sign-outs and writes lost on the next sync.
        $tunnels = array_column(array_filter($nodes, static fn (array $n): bool => $n['status'] === 'online' && $n['tunnel'] === 'on'), 'name');

        if (count($tunnels) > 1) {
            array_unshift($alerts, ['level' => 'error', 'message' => implode(' and ', $tunnels).' both have their Cloudflare tunnel up: visitors are split between them (random sign-outs, writes lost on the next sync).']);
        }

        foreach ($nodes as $node) {
            // A deploy restarts the app on purpose; the guards do not count that as down either.
            if ($node['status'] === 'online' && ! $node['app_up'] && ! $node['deploying']) {
                $alerts[] = ['level' => 'error', 'message' => "{$node['name']}'s app does not answer on its port."];
            }
        }

        $backupAge = $latest === null ? null : $this->age($latest['time'] ?? null, $now);

        if ($backupAge !== null && $backupAge > 6 * 3600) {
            $alerts[] = ['level' => 'warn', 'message' => 'The newest backup is '.intdiv($backupAge, 3600).' hours old. That is normal only if nothing changed since.'];
        }

        $missing = array_filter($dataEvents, static fn (array $e): bool => ($e['data']['verdict'] ?? '') === 'rows_missing');

        if ($missing !== []) {
            $alerts[] = ['level' => 'error', 'message' => count($missing).' hand-over(s) in the last 30 days replaced a node\'s data with a backup that had fewer rows. See "Possible data loss" below; the replaced data is in the named safety dump.'];
        }

        return $alerts;
    }

    // ---- reading the bucket ------------------------------------------------

    /**
     * @return array<string, mixed>|null
     */
    private function json(string $key): ?array
    {
        $raw = $this->disk->get($key);

        return is_string($raw) ? $this->decode($raw) : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    private function decode(string $raw): ?array
    {
        $data = json_decode($raw, true);

        return is_array($data) ? $data : null;
    }

    /**
     * @return list<string>
     */
    private function keys(string $prefix): array
    {
        return array_values(array_filter(
            (array) $this->disk->files(rtrim($prefix, '/')),
            static fn ($k): bool => is_string($k) && str_ends_with($k, '.json'),
        ));
    }

    /**
     * Event object keys. On the real bucket only the last few days are listed
     * (the key starts with its UTC stamp), so a page load stays cheap; the test
     * disk lists everything.
     *
     * @return list<string>
     */
    private function eventKeys(int $days = self::DAYS_LISTED): array
    {
        $client = $this->client();

        if ($client === null) {
            return $this->keys('events/');
        }

        $keys = [];

        for ($i = 0; $i < $days; $i++) {
            $prefix = 'events/'.gmdate('Ymd', time() - $i * 86400);
            $token = null;

            do {
                $params = ['Bucket' => $this->bucket(), 'Prefix' => $prefix] + ($token === null ? [] : ['ContinuationToken' => $token]);
                $result = $client->listObjectsV2($params);

                foreach ($result['Contents'] ?? [] as $object) {
                    if (is_string($object['Key'] ?? null) && str_ends_with($object['Key'], '.json')) {
                        $keys[] = $object['Key'];
                    }
                }

                $token = ($result['IsTruncated'] ?? false) ? ($result['NextContinuationToken'] ?? null) : null;
            } while ($token !== null);
        }

        return $keys;
    }

    /**
     * @param  list<string>  $keys
     * @return list<array<string, mixed>>
     */
    private function fetchAll(array $keys): array
    {
        $client = $this->client();
        $out = [];

        if ($client === null || $keys === []) {
            foreach ($keys as $key) {
                if (($event = $this->json($key)) !== null) {
                    $out[] = $event;
                }
            }

            return $out;
        }

        // Many small objects: fetch them concurrently instead of one by one.
        $commands = array_map(fn (string $key) => $client->getCommand('GetObject', ['Bucket' => $this->bucket(), 'Key' => $key]), $keys);
        $results = CommandPool::batch($client, $commands, ['concurrency' => 15]);

        foreach ($results as $result) {
            if ($result instanceof \Aws\ResultInterface && ($event = $this->decode((string) $result['Body'])) !== null) {
                $out[] = $event;
            }
        }

        return $out;
    }

    private function client(): ?S3Client
    {
        $client = method_exists($this->disk, 'getClient') ? $this->disk->getClient() : null;

        return $client instanceof S3Client ? $client : null;
    }

    private function bucket(): string
    {
        return (string) config('filesystems.disks.backup_r2.bucket');
    }

    private function age(mixed $iso, int $now): ?int
    {
        if (! is_string($iso) || $iso === '') {
            return null;
        }

        $t = strtotime($iso);

        return $t === false ? null : max(0, $now - $t);
    }
}
