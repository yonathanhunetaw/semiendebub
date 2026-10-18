<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Models\Auth\User;
use App\Services\Admin\UptimeHistory;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/** The 24-hour strips on Admin → Settings → System, built from uptime/<node>/<hour>.json. */
class UptimeHistoryTest extends TestCase
{
    use RefreshDatabase;

    /** Aligned to both the 5-minute cell and the hour, so cell arithmetic in the tests is exact. */
    private const NOW = 1_800_000_000;

    private const FROM = self::NOW - 287 * 300;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();
        Storage::fake('backup_r2');
        config(['system_status.history_cache_seconds' => 0, 'system_status.cache_seconds' => 0]);
    }

    /**
     * One sample a minute from $from (inclusive) to $to (exclusive), written the way the scripts do: one object per hour.
     *
     * @param  array<string, mixed>  $o  app_up, db_up, tunnel, deploying, commit
     */
    private function samples(string $node, int $from, int $to, array $o = []): void
    {
        $byHour = [];
        for ($ts = $from; $ts < $to; $ts += 60) {
            $byHour[intdiv($ts, 3600) * 3600][] = [
                $ts, true, $o['db_up'] ?? true, $o['tunnel'] ?? '', $o['app_up'] ?? true, $o['deploying'] ?? 0, $o['commit'] ?? 'abc1234',
            ];
        }

        foreach ($byHour as $hour => $rows) {
            $key = 'uptime/'.$node.'/'.gmdate('Ymd\TH', $hour).'.json';
            $existing = Storage::disk('backup_r2')->exists($key) ? json_decode((string) Storage::disk('backup_r2')->get($key), true)['rows'] : [];
            Storage::disk('backup_r2')->put($key, json_encode(['node' => $node, 'hour' => gmdate('Ymd\TH', $hour), 'from' => $hour, 'rows' => array_merge($existing, $rows)], JSON_THROW_ON_ERROR));
        }
    }

    /** @return list<array<string, mixed>> */
    private function nodes(array ...$nodes): array
    {
        return array_map(static fn (array $n): array => $n + ['role' => 'primary', 'on_demand' => false, 'status' => 'online'], $nodes);
    }

    private function build(array $nodes): array
    {
        return (new UptimeHistory(Storage::disk('backup_r2')))->build($nodes, self::NOW);
    }

    /** Cell index holding this timestamp. */
    private function cell(int $ts): int
    {
        return intdiv($ts - self::FROM, 300);
    }

    #[Test]
    public function a_missing_stretch_is_down_and_never_counted_as_up(): void
    {
        // Reporting 6h..4h ago, silent 4h..3h ago, reporting again until 10 minutes ago (the upload lag).
        $this->samples('ubuntu', self::NOW - 6 * 3600, self::NOW - 4 * 3600);
        $this->samples('ubuntu', self::NOW - 3 * 3600, self::NOW - 600);

        $h = $this->build($this->nodes(['name' => 'ubuntu']));
        $node = $h['nodes'][0];

        $this->assertCount(288, $node['cells']);
        $this->assertSame('unknown', $node['cells'][$this->cell(self::NOW - 10 * 3600)], 'before the first sample nothing is claimed');
        $this->assertSame('up', $node['cells'][$this->cell(self::NOW - 5 * 3600)]);
        $this->assertSame('down', $node['cells'][$this->cell(self::NOW - 3 * 3600 - 1800)]);
        $this->assertSame('up', $node['cells'][$this->cell(self::NOW - 2 * 3600)]);

        $this->assertCount(1, array_filter($node['outages'], static fn (array $o): bool => ! $o['ongoing']));
        $gap = $node['outages'][0];
        $this->assertSame(self::NOW - 4 * 3600, $gap['from']);
        $this->assertSame(60, $gap['minutes']);
        $this->assertLessThan(100.0, $node['uptime_pct']);
    }

    #[Test]
    public function the_newest_minutes_of_an_online_node_are_pending_but_an_offline_node_is_down(): void
    {
        $this->samples('ubuntu', self::NOW - 2 * 3600, self::NOW - 600);
        $this->samples('pi', self::NOW - 2 * 3600, self::NOW - 600);

        $h = $this->build($this->nodes(['name' => 'ubuntu'], ['name' => 'pi', 'status' => 'offline']));
        $last = 287;

        $this->assertSame('pending', $h['nodes'][0]['cells'][$last]);
        $this->assertSame('down', $h['nodes'][1]['cells'][$last]);
        $this->assertTrue($h['nodes'][1]['outages'][0]['ongoing']);
    }

    #[Test]
    public function an_on_demand_node_that_is_off_is_not_an_outage(): void
    {
        $this->samples('mac', self::NOW - 5 * 3600, self::NOW - 4 * 3600);

        $node = $this->build($this->nodes(['name' => 'mac', 'on_demand' => true, 'status' => 'off']))['nodes'][0];

        $this->assertSame('off', $node['cells'][$this->cell(self::NOW - 2 * 3600)]);
        $this->assertSame([], $node['outages']);
        $this->assertNull($node['uptime_pct']);
    }

    #[Test]
    public function a_down_app_is_down_a_mixed_cell_is_degraded_and_a_deploy_is_not_an_outage(): void
    {
        $this->samples('ubuntu', self::NOW - 3600, self::NOW - 3000);
        $this->samples('ubuntu', self::NOW - 3000, self::NOW - 2700, ['app_up' => false]);
        // 2 of 5 minutes down inside one cell
        $this->samples('ubuntu', self::NOW - 2700, self::NOW - 2400);
        $this->samples('ubuntu', self::NOW - 2400, self::NOW - 2280, ['db_up' => false]);
        $this->samples('ubuntu', self::NOW - 2280, self::NOW - 2100);
        $this->samples('ubuntu', self::NOW - 2100, self::NOW - 1800, ['app_up' => false, 'deploying' => self::NOW - 2100]);

        $c = $this->build($this->nodes(['name' => 'ubuntu']))['nodes'][0]['cells'];

        $this->assertSame('down', $c[$this->cell(self::NOW - 3000)]);
        $this->assertSame('degraded', $c[$this->cell(self::NOW - 2400)]);
        $this->assertSame('deploying', $c[$this->cell(self::NOW - 2100)]);
    }

    #[Test]
    public function the_live_track_names_the_node_whose_tunnel_was_up_and_flags_two_at_once(): void
    {
        $this->samples('ubuntu', self::NOW - 4 * 3600, self::NOW - 3 * 3600, ['tunnel' => 'on']);
        $this->samples('pi', self::NOW - 3 * 3600, self::NOW - 2 * 3600, ['tunnel' => 'on']);
        $this->samples('ubuntu', self::NOW - 2 * 3600, self::NOW - 3600, ['tunnel' => 'on']);
        $this->samples('pi', self::NOW - 2 * 3600, self::NOW - 3600, ['tunnel' => 'on']);

        $live = $this->build($this->nodes(['name' => 'ubuntu'], ['name' => 'pi']))['live'];

        $this->assertSame('ubuntu', $live[$this->cell(self::NOW - 3 * 3600 - 600)]);
        $this->assertSame('pi', $live[$this->cell(self::NOW - 2 * 3600 - 600)]);
        $this->assertSame('multiple', $live[$this->cell(self::NOW - 3600 - 600)]);
        $this->assertNull($live[$this->cell(self::NOW - 20 * 3600)]);
    }

    #[Test]
    public function commit_changes_are_listed(): void
    {
        $this->samples('ubuntu', self::NOW - 3 * 3600, self::NOW - 2 * 3600, ['commit' => 'aaaaaaa']);
        $this->samples('ubuntu', self::NOW - 2 * 3600, self::NOW - 3600, ['commit' => 'bbbbbbb']);

        $commits = $this->build($this->nodes(['name' => 'ubuntu']))['nodes'][0]['commits'];

        $this->assertSame([['ts' => self::NOW - 2 * 3600, 'from' => 'aaaaaaa', 'to' => 'bbbbbbb']], $commits);
    }

    #[Test]
    public function a_node_without_any_history_is_unknown_not_up(): void
    {
        $node = $this->build($this->nodes(['name' => 'ubuntu']))['nodes'][0];

        $this->assertSame(['unknown'], array_values(array_unique($node['cells'])));
        $this->assertNull($node['uptime_pct']);
        $this->assertSame([], $node['outages']);
    }

    #[Test]
    public function node_names_that_are_not_plain_never_reach_an_object_key(): void
    {
        $h = $this->build($this->nodes(['name' => '../events'], ['name' => 'ubuntu']));

        $this->assertSame(['ubuntu'], array_column($h['nodes'], 'name'));
    }

    // ---- the page ----------------------------------------------------------

    #[Test]
    public function the_page_defers_the_history_and_only_passes_plain_links(): void
    {
        Role::firstOrCreate(['name' => 'admin']);
        config([
            'filesystems.disks.backup_r2.key' => 'k',
            'filesystems.disks.backup_r2.secret' => 's',
            'filesystems.disks.backup_r2.endpoint' => 'https://example.invalid',
            'system_status.links' => [
                ['label' => 'Ops Console', 'url' => 'http://localhost:4000'],
                ['label' => 'Bad', 'url' => 'javascript:alert(1)'],
            ],
        ]);
        Storage::disk('backup_r2')->put('nodes/ubuntu.json', json_encode(['node' => 'ubuntu', 'role' => 'primary', 'ts' => time(), 'db_up' => true]));
        $user = User::factory()->create(['role' => 'admin', 'store_id' => null]);
        $user->assignRole('admin');
        $this->withServerVariables(['HTTP_HOST' => 'admin.'.config('app.system_domain')]);

        $this->actingAs($user)->get(route('admin.system.index'))->assertOk()
            ->assertInertia(fn ($page) => $page
                ->missing('history')
                ->where('links', [['label' => 'Ops Console', 'url' => 'http://localhost:4000']])
                ->loadDeferredProps(fn ($p) => $p->has('history.nodes', 1)->where('history.step', 300)));
    }
}
