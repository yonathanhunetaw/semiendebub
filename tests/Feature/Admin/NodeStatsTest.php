<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Services\Admin\SystemStatus;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/** Containers and machine resources on the System page, from stats/<node>.json. */
class NodeStatsTest extends TestCase
{
    private const NOW = 1_800_000_000;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('backup_r2');
        config(['system_status.node_name' => 'ubuntu', 'system_status.node_role' => 'primary']);
        // A fresh lease, so the only alerts a test sees are the ones it provokes.
        Storage::disk('backup_r2')->put('primary.json', json_encode(['node' => 'ubuntu', 'ts' => self::NOW - 30, 'ttl' => 900, 'pinned' => false]));
    }

    /** @param array<string, mixed> $extra */
    private function node(string $name, array $extra = []): void
    {
        Storage::disk('backup_r2')->put("nodes/{$name}.json", json_encode($extra + [
            'ts' => self::NOW - 20, 'node' => $name, 'role' => 'primary', 'on_demand' => false, 'in_sync' => true, 'db_up' => true, 'app_up' => true,
        ], JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed> $extra */
    private function stats(string $name, array $extra = []): void
    {
        Storage::disk('backup_r2')->put("stats/{$name}.json", json_encode($extra + [
            'ts' => self::NOW - 100, 'node' => $name, 'docker_ok' => true,
            'ps' => [
                ['duka-prod-app', 'duka-prod-duka-app', 'running', 'Up 3 days (healthy)'],
                ['duka-prod-db', 'mysql:8.0', 'running', 'Up 3 days'],
                ['old-immich', 'immich', 'exited', 'Exited (0) 2 months ago'],
            ],
            'inspect' => [
                ['duka-prod-app', '0', gmdate('Y-m-d\TH:i:s.5\Z', self::NOW - 3 * 86400), 'healthy'],
                ['duka-prod-db', '2', gmdate('Y-m-d\TH:i:s\Z', self::NOW - 3 * 86400), ''],
                ['old-immich', '0', '0001-01-01T00:00:00Z', ''],
            ],
            'stats' => [['duka-prod-app', '12.50%', '512MiB / 3.7GiB'], ['duka-prod-db', '3.1%', '1.5GiB / 3.7GiB']],
            'host' => ['cpus' => 4, 'load' => [1.0, 0.5, 0.2], 'mem_total_kb' => 4_000_000, 'mem_avail_kb' => 2_000_000, 'uptime_s' => 86400, 'temp_c' => 55,
                'disks' => [['/', '100000000', '40000000']]],
        ], JSON_THROW_ON_ERROR));
    }

    private function snapshot(): array
    {
        return (new SystemStatus(Storage::disk('backup_r2')))->snapshot(self::NOW);
    }

    private function res(array $snapshot, string $name): array
    {
        return array_values(array_filter($snapshot['resources'], static fn (array $n): bool => $n['name'] === $name))[0];
    }

    #[Test]
    public function containers_are_joined_by_name_with_units_converted_and_the_busiest_first(): void
    {
        $this->node('ubuntu');
        $this->stats('ubuntu');

        $r = $this->res($this->snapshot(), 'ubuntu');
        [$db, $app, $old] = $r['containers'];

        $this->assertTrue($r['reported']);
        $this->assertFalse($r['stale']);
        $this->assertSame('duka-prod-db', $db['name'], 'most memory first');
        $this->assertSame((int) round(1.5 * 1024 ** 3), $db['mem']);
        $this->assertSame(2, $db['restarts']);
        $this->assertSame(12.5, $app['cpu']);
        $this->assertSame('healthy', $app['health']);
        $this->assertSame(3 * 86400, $app['uptime']);
        $this->assertSame('exited', $old['state'], 'stopped ones come last');
        $this->assertNull($old['uptime']);
        $this->assertNull($old['cpu']);
    }

    #[Test]
    public function host_numbers_become_percentages(): void
    {
        $this->node('ubuntu');
        $this->stats('ubuntu');

        $host = $this->res($this->snapshot(), 'ubuntu')['host'];

        $this->assertSame(25, $host['load_pct']);
        $this->assertSame(50, $host['mem_pct']);
        $this->assertSame(40, $host['disks'][0]['pct']);
        $this->assertSame(55, $host['temp_c']);
        $this->assertSame([], $this->snapshot()['alerts']);
    }

    #[Test]
    public function a_full_disk_no_memory_heat_and_a_sick_container_raise_alerts(): void
    {
        $this->node('ubuntu');
        $this->stats('ubuntu', [
            'ps' => [['duka-prod-app', 'img', 'running', 'Up 1 hour (unhealthy)'], ['jellyfin', 'img', 'restarting', 'Restarting (1) 5 seconds ago'], ['old', 'img', 'exited', 'Exited']],
            'inspect' => [], 'stats' => [],
            'host' => ['cpus' => 2, 'load' => [0, 0, 0], 'mem_total_kb' => 1000, 'mem_avail_kb' => 50, 'uptime_s' => 1, 'temp_c' => 86, 'disks' => [['/', '100', '96']]],
        ]);

        $messages = array_column($this->snapshot()['alerts'], 'message');
        $levels = array_column($this->snapshot()['alerts'], 'level', 'message');

        $this->assertSame('error', $levels["ubuntu's disk / is 96% full."]);
        $this->assertContains('ubuntu has under 10% of its memory left.', $messages);
        $this->assertSame('error', $levels['ubuntu is running hot: 86°C.']);
        $this->assertContains('Container duka-prod-app on ubuntu reports unhealthy.', $messages);
        $this->assertContains('Container jellyfin on ubuntu is restarting.', $messages);
        $this->assertCount(5, $messages, 'a stopped container is not an alert');
    }

    #[Test]
    public function a_node_that_has_not_reported_resources_is_marked_so_and_old_numbers_raise_nothing(): void
    {
        $this->node('ubuntu');
        $this->node('pi');
        $this->stats('pi', ['ts' => self::NOW - 3600, 'host' => ['cpus' => 1, 'load' => [0, 0, 0], 'mem_total_kb' => 0, 'mem_avail_kb' => 0, 'uptime_s' => 0, 'temp_c' => null, 'disks' => [['/', '100', '99']]]]);

        $s = $this->snapshot();

        $this->assertFalse($this->res($s, 'ubuntu')['reported']);
        $this->assertTrue($this->res($s, 'pi')['stale']);
        $this->assertSame([], $s['alerts'], 'stale numbers are shown as stale, not alerted');
    }

    #[Test]
    public function a_down_docker_and_garbage_files_do_not_break_the_page(): void
    {
        $this->node('ubuntu');
        Storage::disk('backup_r2')->put('stats/ubuntu.json', json_encode(['ts' => self::NOW, 'docker_ok' => false, 'ps' => 'nope', 'inspect' => null, 'stats' => [['x']], 'host' => 'bad']));

        $r = $this->res($this->snapshot(), 'ubuntu');

        $this->assertFalse($r['docker_ok']);
        $this->assertSame([], $r['containers']);
        $this->assertSame(1, $r['host']['cpus']);
        $this->assertNull($r['host']['mem_pct']);

        Storage::disk('backup_r2')->put('stats/ubuntu.json', '{not json');
        $this->assertFalse($this->res($this->snapshot(), 'ubuntu')['reported']);
    }
}
