<?php

declare(strict_types=1);

namespace Tests\Feature\Admin;

use App\Services\Admin\SystemStatus;
use Aws\CommandInterface;
use Aws\Result;
use Aws\S3\S3Client;
use Illuminate\Filesystem\FilesystemAdapter;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Tests\TestCase;

/**
 * SystemStatus against a real S3 client (the AWS SDK's MockHandler stands in
 * for R2): event keys are listed day by day, page by page, and their objects
 * fetched concurrently. SystemStatusTest covers the plain-disk path.
 */
class SystemStatusR2ListingTest extends TestCase
{
    /** @var list<array{string, array<string, mixed>}> */
    private array $calls = [];

    private function systemStatus(callable $handler): SystemStatus
    {
        config(['filesystems.disks.backup_r2.bucket' => 'duka-backups', 'system_status.cache_seconds' => 0]);

        $client = new S3Client([
            'region' => 'auto', 'version' => 'latest', 'handler' => $handler,
            'credentials' => ['key' => 'k', 'secret' => 's'],
        ]);

        $fake = Storage::fake('backup_r2');
        $disk = new class($fake->getDriver(), $fake->getAdapter(), $fake->getConfig(), $client) extends FilesystemAdapter
        {
            public function __construct($driver, $adapter, array $config, private readonly S3Client $client)
            {
                parent::__construct($driver, $adapter, $config);
            }

            public function getClient(): S3Client
            {
                return $this->client;
            }
        };

        return new SystemStatus($disk);
    }

    private function event(string $type, int $ts): Result
    {
        return new Result(['Body' => json_encode([
            'ts' => $ts, 'time' => gmdate('Y-m-d\TH:i:s\Z', $ts), 'node' => 'ubuntu', 'role' => 'primary',
            'type' => $type, 'level' => 'info', 'message' => $type, 'data' => [],
        ])]);
    }

    #[Test]
    public function event_keys_are_listed_across_days_and_pages_then_fetched(): void
    {
        $now = time();
        $today = 'events/'.gmdate('Ymd', $now);
        $yesterday = 'events/'.gmdate('Ymd', $now - 86400);

        $objects = [
            "{$today}T010000Z_ubuntu_backup_pushed_1.json" => $this->event('backup_pushed', $now - 300),
            "{$today}T020000Z_ubuntu_lease_renewed_1.json" => $this->event('lease_renewed', $now - 200),
            "{$yesterday}T230000Z_pi_sync_done_1.json" => $this->event('sync_done', $now - 90000),
        ];

        // Today spans two pages; yesterday holds a stray non-JSON key; other days are empty.
        $handler = function (CommandInterface $cmd) use ($today, $yesterday, $objects) {
            $args = $cmd->toArray();
            $this->calls[] = [$cmd->getName(), $args];

            $result = match (true) {
                $cmd->getName() === 'GetObject' => $objects[$args['Key']],
                $args['Prefix'] === $today && ! isset($args['ContinuationToken']) => new Result([
                    'Contents' => [['Key' => "{$today}T010000Z_ubuntu_backup_pushed_1.json"]], 'IsTruncated' => true, 'NextContinuationToken' => 'page-2',
                ]),
                $args['Prefix'] === $today => new Result(['Contents' => [['Key' => "{$today}T020000Z_ubuntu_lease_renewed_1.json"]], 'IsTruncated' => false]),
                $args['Prefix'] === $yesterday => new Result(['Contents' => [['Key' => "{$yesterday}T230000Z_pi_sync_done_1.json"], ['Key' => "{$yesterday}T230000Z_notes.txt"]]]),
                default => new Result(['Contents' => []]),
            };

            return \GuzzleHttp\Promise\Create::promiseFor($result);
        };

        $events = $this->systemStatus($handler)->snapshot($now)['events'];

        // Newest first by the UTC stamp the key starts with.
        $this->assertSame(['lease_renewed', 'backup_pushed', 'sync_done'], array_column($events, 'type'));

        // The days are listed all at once, so only what was asked matters, not the order.
        $listings = array_column(array_values(array_filter($this->calls, fn ($c) => $c[0] === 'ListObjectsV2')), 1);
        $this->assertSame(['duka-backups'], array_values(array_unique(array_column($listings, 'Bucket'))));
        $first = array_values(array_filter($listings, fn ($l) => ! isset($l['ContinuationToken'])));
        $pages = array_values(array_filter($listings, fn ($l) => isset($l['ContinuationToken'])));
        $this->assertSame($today, $first[0]['Prefix']);
        $this->assertSame($yesterday, $first[1]['Prefix']);
        $this->assertCount(1, $pages);
        $this->assertSame([$today, 'page-2'], [$pages[0]['Prefix'], $pages[0]['ContinuationToken']], 'the second page is asked for by its token');
        $this->assertCount(count(array_unique(array_column($first, 'Prefix'))), $first, 'each day is listed once, though two reads want it');

        $fetched = array_column(array_values(array_filter($this->calls, fn ($c) => $c[0] === 'GetObject')), 1);
        $this->assertNotContains("{$yesterday}T230000Z_notes.txt", array_column($fetched, 'Key'), 'only .json keys are fetched');
    }
}
