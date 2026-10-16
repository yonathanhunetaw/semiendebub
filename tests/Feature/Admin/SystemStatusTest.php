<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Models\Store\Store;
use App\Services\Admin\SystemStatus;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** Admin → Settings → System: the read-only status page built from the backup bucket. */
class SystemStatusTest extends TestCase
{
    use RefreshDatabase;

    private const NOW = 1_800_000_000;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        Role::firstOrCreate(['name' => 'admin']);
        Storage::fake('backup_r2');

        config([
            'filesystems.disks.backup_r2.key' => 'k',
            'filesystems.disks.backup_r2.secret' => 's',
            'filesystems.disks.backup_r2.endpoint' => 'https://example.invalid',
            'system_status.cache_seconds' => 0,
            'system_status.node_name' => 'ubuntu',
            'system_status.node_role' => 'primary',
        ]);

        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);
    }

    private function globalAdmin(): User
    {
        $user = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $user->assignRole('admin');

        return $user;
    }

    /** @param array<string, mixed> $data */
    private function store(string $key, array $data): void
    {
        Storage::disk('backup_r2')->put($key, json_encode($data, JSON_THROW_ON_ERROR));
    }

    /** @param array<string, mixed> $extra */
    private function event(string $stamp, string $node, string $type, string $level, string $message, array $extra = []): void
    {
        $ts = self::NOW - (int) ($extra['_ago'] ?? 60);
        unset($extra['_ago']);

        $this->store("events/{$stamp}_{$node}_{$type}_1.json", [
            'ts' => $ts, 'time' => gmdate('Y-m-d\TH:i:s\Z', $ts), 'node' => $node, 'role' => 'primary',
            'type' => $type, 'level' => $level, 'message' => $message, 'data' => $extra,
        ]);
    }

    private function snapshot(): array
    {
        return (new SystemStatus(Storage::disk('backup_r2')))->snapshot(self::NOW);
    }

    // ---- who can open it ---------------------------------------------------

    #[Test]
    public function a_global_admin_opens_the_page(): void
    {
        $this->actingAs($this->globalAdmin());

        $this->get(route('admin.system.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->component('Admin/System/Index')->where('configured', true)->has('status'));
    }

    #[Test]
    public function a_store_admin_is_turned_away(): void
    {
        $store = Store::factory()->create(['type' => Store::TYPE_RETAIL]);
        $user = User::factory()->create(['role' => 'admin', 'store_id' => $store->id]);
        $user->assignRole('admin');

        $this->actingAs($user)->get(route('admin.system.index'))->assertForbidden();
    }

    #[Test]
    public function a_guest_is_sent_to_log_in(): void
    {
        $this->get(route('admin.system.index'))->assertRedirect();
    }

    #[Test]
    public function without_bucket_credentials_the_page_says_so_and_reads_nothing(): void
    {
        config(['filesystems.disks.backup_r2.key' => null]);
        $this->actingAs($this->globalAdmin());

        $this->get(route('admin.system.index'))->assertOk()
            ->assertInertia(fn ($page) => $page->where('configured', false)->where('status', null));
    }

    // ---- what it shows -----------------------------------------------------

    #[Test]
    public function the_node_holding_a_fresh_lease_is_live(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 40, 'ttl' => 900, 'pinned' => false]);
        $this->store('latest.json', ['file' => 'f.sql.gz', 'sha256' => 'abc', 'node' => 'ubuntu', 'time' => gmdate('Y-m-d\TH:i:s\Z', self::NOW - 120), 'bytes' => 2048]);
        $this->store('deployed.json', ['commit' => 'abcdef1234', 'node' => 'ubuntu', 'time' => '2026-10-14T00:00:00Z']);

        $s = $this->snapshot();

        $this->assertSame('ubuntu', $s['live_node']);
        $this->assertSame(40, $s['lease']['age']);
        $this->assertTrue($s['lease']['fresh']);
        $this->assertSame(120, $s['latest_backup']['age']);
        $this->assertSame('abcdef1234', $s['deployed']['commit']);
        $this->assertSame([], $s['alerts']);
        $this->assertFalse($s['empty']);
    }

    #[Test]
    public function an_expired_lease_means_nobody_is_live_and_raises_an_error(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 1000, 'ttl' => 900, 'pinned' => false]);

        $s = $this->snapshot();

        $this->assertNull($s['live_node']);
        $this->assertSame('error', $s['alerts'][0]['level']);
        $this->assertStringContainsString('may be down', $s['alerts'][0]['message']);
    }

    #[Test]
    public function a_released_lease_is_a_warning_not_an_error(): void
    {
        $this->store('primary.json', ['node' => '', 'ts' => 0, 'ttl' => 0, 'pinned' => false]);

        $s = $this->snapshot();

        $this->assertNull($s['live_node']);
        $this->assertSame('warn', $s['alerts'][0]['level']);
    }

    #[Test]
    public function the_pinned_ttl_of_the_on_demand_node_is_honoured(): void
    {
        $this->store('primary.json', ['node' => 'mac', 'ts' => self::NOW - 200, 'ttl' => 180, 'pinned' => true]);

        $s = $this->snapshot();

        $this->assertNull($s['live_node'], 'a 180 s lease that is 200 s old has expired');
        $this->assertTrue($s['lease']['pinned']);
    }

    #[Test]
    public function node_statuses_follow_the_heartbeat_age_and_the_on_demand_flag(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 10, 'ttl' => 900, 'pinned' => false]);
        $beat = fn (string $node, int $ago, array $extra = []) => $this->store("nodes/{$node}.json", $extra + [
            'ts' => self::NOW - $ago, 'node' => $node, 'role' => 'standby', 'on_demand' => false,
            'commit' => '7dad1b8', 'last_sha' => 'abcd', 'in_sync' => true, 'db_up' => true,
        ]);
        $beat('ubuntu', 30, ['role' => 'primary']);
        $beat('pi', 400);
        $beat('mac', 5, ['on_demand' => true, 'db_up' => false]);
        $beat('old', 5000);

        $byName = collect($this->snapshot()['nodes'])->keyBy('name');

        $this->assertSame('online', $byName['ubuntu']['status']);
        $this->assertTrue($byName['ubuntu']['is_live']);
        $this->assertSame('stale', $byName['pi']['status']);
        $this->assertSame('off', $byName['mac']['status'], 'an on-demand node with its database down is simply off');
        $this->assertSame('offline', $byName['old']['status']);
        $this->assertSame('ubuntu', $this->snapshot()['nodes'][0]['name'], 'the live node is listed first');
    }

    #[Test]
    public function events_are_listed_newest_first_with_their_level_and_data(): void
    {
        $this->event('20261014T030000Z', 'ubuntu', 'backup_pushed', 'info', 'ubuntu uploaded a backup', ['file' => 'a.sql.gz', '_ago' => 300]);
        $this->event('20261014T031200Z', 'pi', 'lease_takeover', 'warn', 'pi took the primary lease from ubuntu (forced)', ['from' => 'ubuntu', 'forced' => true, '_ago' => 60]);

        $events = $this->snapshot()['events'];

        $this->assertSame(['lease_takeover', 'backup_pushed'], array_column($events, 'type'));
        $this->assertSame('warn', $events[0]['level']);
        $this->assertSame('ubuntu', $events[0]['data']['from']);
        $this->assertSame(60, $events[0]['age']);
    }

    #[Test]
    public function a_data_replacing_hand_over_with_missing_rows_is_flagged_with_the_tables_and_the_safety_dump(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 5, 'ttl' => 900, 'pinned' => false]);
        $this->event('20261014T031320Z', 'ubuntu', 'data_replaced', 'warn', 'ubuntu replaced its data with the backup from pi (3 rows missing, 0 new)', [
            'from' => 'pi', 'verdict' => 'rows_missing', 'rows_missing' => 3, 'rows_added' => 0,
            'safety_dump' => 'pre-catchup_20261014T031320Z.sql.gz', 'changed' => ['orders' => [123, 120]],
        ]);
        $this->event('20261013T100000Z', 'pi', 'data_replaced', 'info', 'pi replaced its data', ['verdict' => 'identical_rowcounts', 'rows_missing' => 0, 'rows_added' => 0, 'changed' => []]);

        $s = $this->snapshot();

        $this->assertCount(2, $s['data_events']);
        $this->assertSame('rows_missing', $s['data_events'][0]['data']['verdict']);
        $this->assertSame([123, 120], $s['data_events'][0]['data']['changed']['orders']);
        $this->assertSame('pre-catchup_20261014T031320Z.sql.gz', $s['data_events'][0]['data']['safety_dump']);
        $this->assertStringContainsString('1 hand-over', $s['alerts'][0]['message']);
        $this->assertSame('error', $s['alerts'][0]['level']);
    }

    #[Test]
    public function a_clean_hand_over_raises_no_data_alert(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 5, 'ttl' => 900, 'pinned' => false]);
        $this->event('20261014T031320Z', 'ubuntu', 'data_replaced', 'info', 'ubuntu replaced its data', ['verdict' => 'identical_rowcounts', 'rows_missing' => 0, 'rows_added' => 0, 'changed' => []]);

        $this->assertSame([], $this->snapshot()['alerts']);
    }

    #[Test]
    public function an_online_node_that_is_behind_the_newest_backup_is_called_out(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 5, 'ttl' => 900, 'pinned' => false]);
        $this->store('nodes/pi.json', ['ts' => self::NOW - 10, 'node' => 'pi', 'role' => 'standby', 'on_demand' => false, 'commit' => 'x', 'last_sha' => 'a', 'in_sync' => false, 'db_up' => true]);

        $this->assertStringContainsString('pi is online but its data does not match', $this->snapshot()['alerts'][0]['message']);
    }

    #[Test]
    public function two_nodes_with_their_tunnel_up_raise_an_error_first(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 5, 'ttl' => 900, 'pinned' => false]);
        foreach (['ubuntu' => 'primary', 'pi' => 'standby'] as $node => $role) {
            $this->store("nodes/{$node}.json", ['ts' => self::NOW - 10, 'node' => $node, 'role' => $role, 'on_demand' => false, 'commit' => 'x', 'last_sha' => 'a', 'in_sync' => true, 'db_up' => true, 'tunnel' => 'on', 'app_up' => true]);
        }

        $snapshot = $this->snapshot();

        $this->assertSame('error', $snapshot['alerts'][0]['level']);
        $this->assertStringContainsString('both have their Cloudflare tunnel up', $snapshot['alerts'][0]['message']);
        $this->assertSame('on', $snapshot['nodes'][0]['tunnel']);
    }

    #[Test]
    public function one_tunnel_up_and_old_heartbeats_without_the_field_raise_nothing(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 5, 'ttl' => 900, 'pinned' => false]);
        $this->store('nodes/ubuntu.json', ['ts' => self::NOW - 10, 'node' => 'ubuntu', 'role' => 'primary', 'on_demand' => false, 'commit' => 'x', 'last_sha' => 'a', 'in_sync' => true, 'db_up' => true, 'tunnel' => 'on', 'app_up' => true]);
        $this->store('nodes/pi.json', ['ts' => self::NOW - 10, 'node' => 'pi', 'role' => 'standby', 'on_demand' => false, 'commit' => 'x', 'last_sha' => 'a', 'in_sync' => true, 'db_up' => true]);

        $snapshot = $this->snapshot();

        $this->assertSame([], $snapshot['alerts']);
        $this->assertSame('', collect($snapshot['nodes'])->firstWhere('name', 'pi')['tunnel']);
    }

    #[Test]
    public function a_node_that_is_deploying_is_marked_and_its_restarting_app_raises_no_error(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 5, 'ttl' => 900, 'pinned' => false]);
        $this->store('nodes/ubuntu.json', ['ts' => self::NOW - 10, 'node' => 'ubuntu', 'role' => 'primary', 'on_demand' => false, 'commit' => 'x', 'last_sha' => 'a', 'in_sync' => true, 'db_up' => true, 'tunnel' => 'on', 'app_up' => false, 'deploying' => self::NOW - 70]);

        $snapshot = $this->snapshot();

        $this->assertTrue($snapshot['nodes'][0]['deploying']);
        $this->assertSame(70, $snapshot['nodes'][0]['deploying_age']);
        $this->assertSame([], $snapshot['alerts']);
    }

    #[Test]
    public function a_stale_deploy_mark_is_ignored_and_a_down_app_is_an_error_again(): void
    {
        $this->store('primary.json', ['node' => 'ubuntu', 'ts' => self::NOW - 5, 'ttl' => 900, 'pinned' => false]);
        $this->store('nodes/ubuntu.json', ['ts' => self::NOW - 10, 'node' => 'ubuntu', 'role' => 'primary', 'on_demand' => false, 'commit' => 'x', 'last_sha' => 'a', 'in_sync' => true, 'db_up' => true, 'tunnel' => 'on', 'app_up' => false, 'deploying' => self::NOW - 5000]);
        $this->store('nodes/pi.json', ['ts' => self::NOW - 10, 'node' => 'pi', 'role' => 'standby', 'on_demand' => false, 'commit' => 'x', 'last_sha' => 'a', 'in_sync' => true, 'db_up' => true, 'tunnel' => 'off', 'app_up' => true, 'deploying' => 0]);

        $byName = collect($this->snapshot()['nodes'])->keyBy('name');

        $this->assertFalse($byName['ubuntu']['deploying']);
        $this->assertNull($byName['pi']['deploying_age']);
        $this->assertStringContainsString("ubuntu's app does not answer", $this->snapshot()['alerts'][0]['message']);
    }

    #[Test]
    public function an_empty_bucket_and_broken_files_do_not_break_the_page(): void
    {
        $this->assertTrue($this->snapshot()['empty']);

        Storage::disk('backup_r2')->put('primary.json', '{not json');
        Storage::disk('backup_r2')->put('events/20261014T000000Z_x_y_1.json', 'garbage');

        $s = $this->snapshot();

        $this->assertNull($s['lease']);
        $this->assertSame([], $s['events']);
    }
}
