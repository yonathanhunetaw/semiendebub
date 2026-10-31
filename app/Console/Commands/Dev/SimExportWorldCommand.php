<?php

declare(strict_types=1);

namespace App\Console\Commands\Dev;

use App\Models\Finance\Expense;
use App\Models\Finance\Payment;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\Stocktake;
use App\Models\Workforce\KeyHandover;
use App\Models\Workforce\LeaveRequest;
use App\Models\Workforce\ShiftSwap;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\StaffRide;
use App\Models\Workforce\TimeEntry;
use App\Services\Dev\Sim\SimCast;
use App\Services\Guide\WorldFeed;
use App\Services\Workforce\LocalTime;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\File;

/**
 * Records the simulated week as the Guide world's Demo week (make sim-export): for each simulated day, what the
 * world's feed returns (shipments, orders, events with their people and amounts), written to
 * public/demo/world/<date>.json with an index.json of the days. Deployed with the app, the world replays them
 * when Demo week is switched on, on prod too, without a single sim row in its database.
 *
 * duka_sim is a copy of dev (and dev of prod), so everything the sim did not make is left out: only the sim's
 * people, customers, sales, shipments and work go into the files.
 *
 * Only on a *_sim database.
 */
final class SimExportWorldCommand extends Command
{
    /** @var string */
    protected $signature = 'sim:export-world {--days=7 : Days ending today} {--dir=public/demo/world : Where the files go}';

    /** @var string */
    protected $description = 'Write the simulated week as the Guide world\'s Demo week (public/demo/world/*.json)';

    public function handle(SimCast $cast, WorldFeed $feed): int
    {
        if (($refusal = SimCast::refusal()) !== null) {
            $this->components->error($refusal);

            return self::FAILURE;
        }

        $cast->load();
        $viewer = $cast->person('admin');
        $people = collect($cast->people)->pluck('id')->map(fn ($id): int => (int) $id)->all();
        $customers = collect([...$cast->businesses, ...$cast->individuals])->pluck('id')->map(fn ($id): int => (int) $id)->all();
        $option = (string) $this->option('dir');
        $dir = str_starts_with($option, '/') ? $option : base_path($option);
        File::ensureDirectoryExists($dir);
        File::delete(File::glob($dir.'/*.json'));

        $days = [];
        $today = LocalTime::today();
        for ($i = max(1, (int) $this->option('days')) - 1; $i >= 0; $i--) {
            $date = $today->subDays($i);
            $from = LocalTime::startOf($date);
            $to = $from->addDay()->subSecond();

            $payload = $feed->between($from, $to, $viewer);
            $payload['refills'] = [];
            $payload['orders'] = $feed->orders($from, $to, $viewer);
            $payload['events'] = $feed->events($from, $to, $viewer);
            $payload['containers'] = [];
            // The demo's days come from index.json, not from what else the database holds.
            $payload['days'] = [];
            $payload = $this->onlySim($payload, $people, $customers);
            $payload = $this->onlySimNames($payload, $cast);

            if ($payload['orders'] === [] && $payload['shipments'] === [] && $payload['events'] === []) {
                continue;
            }

            $days[] = $date->toDateString();
            File::put("{$dir}/{$date->toDateString()}.json", json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            $this->line(sprintf('  %s  %d orders, %d shipments, %d events', $date->format('D d M'), count($payload['orders']), count($payload['shipments']), count($payload['events'])));
        }

        File::put("{$dir}/index.json", json_encode([
            'days' => $days,
            'recorded_at' => now()->toIso8601String(),
            'store' => $cast->store->name,
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));

        $size = array_sum(array_map('filesize', File::glob($dir.'/*.json')));
        $this->components->info(sprintf('Demo week: %d days, %.1f MB in %s. Commit them and deploy; Demo week in the world plays them.', count($days), $size / 1048576, (string) $this->option('dir')));

        return self::SUCCESS;
    }

    /**
     * The second guard: every name in the files is one of the sim's people or customers. A real person who touched
     * a sim record on the copy (a dev courier claiming a sim delivery, say) is written as their role instead.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, mixed>
     */
    private function onlySimNames(array $payload, SimCast $cast): array
    {
        $allowed = [];
        foreach ($cast->people as $person) {
            $allowed[] = (string) $person->first_name;
            $allowed[] = trim($person->first_name.' '.$person->last_name);
        }
        foreach ([...$cast->businesses, ...$cast->individuals] as $customer) {
            $allowed[] = (string) $customer->first_name;
            $allowed[] = trim($customer->first_name.' '.$customer->last_name);
        }
        $allowed = array_merge($allowed, array_map('ucfirst', Expense::CATEGORIES), ['Customer', 'Walk-in']);
        $roleOf = ['seller' => 'Seller', 'customer' => 'Customer', 'picker' => 'Stock keeper', 'courier' => 'Courier', 'claimed_by' => 'Seller',
            'confirmed_by' => 'Manager', 'creator' => 'Admin', 'receiver' => 'Stock keeper', 'preparer' => 'Stock keeper'];

        $scrub = function (mixed $value, ?string $key = null) use (&$scrub, $allowed, $roleOf): mixed {
            if (is_array($value)) {
                // An event's person: {name, role}.
                if (isset($value['name'], $value['role']) && count($value) === 2) {
                    return in_array($value['name'], $allowed, true) ? $value : ['name' => ucfirst(str_replace('_', ' ', (string) $value['role'])), 'role' => $value['role']];
                }
                foreach ($value as $k => $v) {
                    $value[$k] = $scrub($v, is_string($k) ? $k : null);
                }

                return $value;
            }

            return is_string($value) && $key !== null && isset($roleOf[$key]) && ! in_array($value, $allowed, true) ? $roleOf[$key] : $value;
        };

        return $scrub($payload);
    }

    /**
     * Keep only what the sim made: its sales, its morning shipments, and work, money and counts by its people.
     *
     * @param  array<string, mixed>  $payload
     * @param  array<int, int>  $people
     * @param  array<int, int>  $customers
     * @return array<string, mixed>
     */
    private function onlySim(array $payload, array $people, array $customers): array
    {
        $sales = Sale::query()->whereIn('id', array_column($payload['orders'], 'id'))->whereIn('seller_id', $people)->pluck('id')->all();
        $payload['orders'] = array_values(array_filter($payload['orders'], fn (array $o): bool => in_array((int) $o['id'], $sales, true)));

        $shipments = Shipment::query()->whereIn('id', array_column($payload['shipments'], 'id'))->whereIn('created_by', $people)->pluck('id')->all();
        $payload['shipments'] = array_values(array_filter($payload['shipments'], fn (array $s): bool => in_array((int) $s['id'], $shipments, true)));

        $ours = fn (string $model, string $column, int $id): bool => $model::query()->whereKey($id)->whereIn($column, $column === 'customer_id' ? $customers : $people)->exists();
        $payload['events'] = array_values(array_filter($payload['events'], function (array $e) use ($ours): bool {
            if (! preg_match('/^([a-z]+)-(\d+)/', (string) $e['key'], $m)) {
                return false;
            }
            $id = (int) $m[2];

            return match ($m[1]) {
                'clock' => $ours(TimeEntry::class, 'user_id', $id),
                'site' => $ours(SiteDay::class, 'opened_by', $id),
                'key' => $ours(KeyHandover::class, 'to_id', $id),
                'swap' => $ours(ShiftSwap::class, 'from_id', $id),
                'leave' => $ours(LeaveRequest::class, 'user_id', $id),
                'ride' => $ours(StaffRide::class, 'driver_id', $id),
                'count' => $ours(Stocktake::class, 'started_by', $id),
                'pay' => $ours(Payment::class, 'customer_id', $id),
                'remit' => $ours(Remittance::class, 'user_id', $id),
                'expense' => $ours(Expense::class, 'recorded_by', $id),
                default => false,
            };
        }));

        return $payload;
    }
}
