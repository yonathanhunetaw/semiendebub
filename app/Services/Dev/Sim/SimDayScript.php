<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

use App\Models\Auth\Customer;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;
use Carbon\CarbonImmutable;
use Random\Engine\Mt19937;
use Random\Randomizer;

/**
 * The timeline of one simulated week: who does what, and when (shop time),
 * as a list of events SimActions knows how to perform. The same seed gives
 * the same week.
 *
 * Each event is ['at' => UTC ISO time, 'kind', 'as' => cast key, 'args',
 * 'ref' => name others may wait on, 'needs' => refs it waits on]. An event
 * whose 'needs' were refused is skipped: a sale nobody could place is never
 * picked.
 *
 * A day, on the shop's own hours (Work → Sites):
 *   hour before    the hub keeper builds and picks the morning shipment; the van key goes to the day's driver
 *   opening        the shop key goes to the opener, who opens with the float; everyone clocks in
 *   morning        the van arrives; the store keeper checks and signs it in
 *   all day        sales to about 100,000 birr (90% to business accounts), money confirmed by a second person,
 *                  pick & pack, couriers, shelf refills, breaks
 *   2 pm           shift change: the opener hands the shop key to the closer
 *   closing        sellers hand their cash to the manager; the closer counts the till and closes
 * plus one-off days: a late opening, a rejected transfer, a cancelled order, a failed delivery,
 * a short shipment, credit repayments, a sick day, a shift swap, overtime, expenses, a stock count.
 */
final class SimDayScript
{
    public const SALES_TARGET = 100_000;

    /** Payment shapes, in the order they first appear so every one is seen early. */
    private const SPLITS = ['cash', 'bank', 'wallet', 'cash+bank', 'bank+wallet', 'cash+bank+wallet', 'later'];

    private const CREDIT_SPLITS = ['credit', 'cash+credit', 'credit', 'bank'];

    private const SELLERS = ['seller1', 'seller2', 'seller3', 'seller4'];

    /** @var array<int, array<string, mixed>> */
    private array $events = [];

    private int $saleNo = 0;

    /** How many credit sales still go to the customer who goes overdue. */
    private int $firstCredit = 2;

    /** @var array<string, true> the one-off set pieces already placed, per day */
    private array $used = [];

    public function __construct(private readonly SimCast $cast, private readonly Sites $sites, private readonly int $seed = 1)
    {
    }

    /**
     * Every event of the week ending today, sorted by time.
     *
     * @return array<int, array<string, mixed>>
     */
    public function week(int $days = 7): array
    {
        $this->events = [];
        $this->used = [];
        $this->saleNo = 0;
        $this->firstCredit = 2;
        $today = LocalTime::today();
        $dates = array_map(fn (int $i): CarbonImmutable => $today->subDays($days - 1 - $i), range(0, $days - 1));
        $open = array_values(array_filter($dates, fn (CarbonImmutable $date): bool => $this->hours($date) !== null));

        // The week's staffing, set by the manager before the first morning. Four sellers:
        // each open day one opens, one closes, one works the middle and one is off.
        $prelude = LocalTime::at($dates[0]->toDateString(), '05:00');
        $plans = [];

        foreach ($open as $i => $date) {
            $plans[$date->toDateString()] = [
                'opener' => self::SELLERS[$i % 4],
                'closer' => self::SELLERS[($i + 1) % 4],
                'middle' => self::SELLERS[($i + 2) % 4],
                'off' => self::SELLERS[($i + 3) % 4],
                'driver' => $i % 2 === 0 ? 'driver1' : 'driver2',
                // On the fifth open day the middle seller wakes up sick.
                'sick' => $i === 4 ? self::SELLERS[($i + 2) % 4] : null,
                // On the fourth, the middle seller has given that shift to the one who was off (agreed the day before).
                'swapped' => $i === 3 ? self::SELLERS[($i + 3) % 4] : null,
            ];
        }

        // The stock count and the long day (closer in at nine, staying late: overtime) are on the
        // last day already over, so they play back-dated with real hours (today is played live).
        $past = array_values(array_filter($open, fn (CarbonImmutable $date): bool => $date->lt($today)));
        $countDay = end($past) ?: null;
        if ($countDay !== null) {
            $plans[$countDay->toDateString()]['overtime'] = true;
        }

        $this->add($prelude->addMinutes(5), 'rota', 'manager', ['plans' => $plans]);

        foreach ($open as $i => $date) {
            $this->day($i, $date, $plans[$date->toDateString()], $open[$i + 1] ?? null, isset($open[$i + 1]) ? $plans[$open[$i + 1]->toDateString()] : null, $countDay !== null && $date->equalTo($countDay));
        }

        usort($this->events, fn (array $a, array $b): int => [$a['at'], $a['seq']] <=> [$b['at'], $b['seq']]);

        return $this->events;
    }

    /**
     * @param  array<string, ?string>  $plan
     * @param  array<string, ?string>|null  $nextPlan
     */
    private function day(int $i, CarbonImmutable $date, array $plan, ?CarbonImmutable $next, ?array $nextPlan, bool $countDay): void
    {
        $rand = new Randomizer(new Mt19937($this->seed * 1000 + (int) $date->format('z')));
        [$opensAt, $closesAt] = array_values($this->hours($date));
        $d = $date->toDateString();
        $at = fn (string $hm, int $plus = 0): CarbonImmutable => LocalTime::at($d, $hm)->addMinutes($plus);
        $open = LocalTime::at($d, $opensAt);
        $close = LocalTime::at($d, $closesAt);
        $tag = "d{$i}";
        // Who sells today: opener, closer and the middle shift (whoever took it in a swap), less anyone off sick.
        $middle = $plan['swapped'] ?? $plan['middle'];
        $working = array_values(array_filter([$plan['opener'], $plan['closer'], $middle], fn (string $s): bool => $s !== $plan['sick']));
        if ($plan['sick'] !== null) {
            $this->add($at('06:00'), 'leave', 'manager', ['person' => $plan['sick'], 'date' => $d]);
        }
        $late = $i === 1;

        // Before opening: the morning shipment, hub → the store floor.
        $this->add($open->subMinutes(70), 'shipment_create', 'hubkeeper', ['driver' => $plan['driver'], 'short' => $i === 2], "{$tag}-ship");
        $this->add($open->subMinutes(65), 'van_key', 'admin', ['to' => $plan['driver']], null, []);
        $this->add($open->subMinutes(55), 'shipment_pick', 'hubkeeper', [], null, ["{$tag}-ship"]);
        $this->add($open->subMinutes(40), 'shipment_load', $plan['driver'], [], null, ["{$tag}-ship"]);

        // Opening: the key reaches the opener (the closer took it home last night).
        $openAt = $late ? $open->addMinutes(25) : $open->subMinutes(5);
        $this->add($openAt->subMinutes(10), 'shop_key', 'manager', ['to' => $plan['opener']]);
        if ($late) {
            $this->add($open->addMinutes(20), 'sweep', 'admin', []);
        }
        $this->add($openAt, 'open_day', $plan['opener'], ['float' => 2000, 'late' => $late], "{$tag}-open");
        foreach (array_merge(array_diff($working, [$plan['opener']]), ['keeper', 'manager']) as $n => $who) {
            $start = match ($who) {
                $plan['closer'] => $at(! empty($plan['overtime']) ? '09:00' : '11:00'),
                $middle => $at('09:00'),
                default => $openAt->addMinutes(3 + $n * 4),
            };
            $this->add($start, 'clock_in', $who, [], null, ["{$tag}-open"]);
        }

        $this->add($open->addMinutes(20), 'shipment_arrive', $plan['driver'], [], null, ["{$tag}-ship"]);
        $this->add($open->addMinutes(35), 'shipment_receive', 'keeper', ['short' => $i === 2], "{$tag}-received", ["{$tag}-ship", "{$tag}-open"]);
        if ($i === 2) {
            // The driver searched the van: the three are gone. The manager writes them off.
            $this->add($at('15:15'), 'resolve_shortage', 'manager', ['resolution' => 'lost', 'note' => 'Not in the van; the driver searched it'], null, ["{$tag}-received"]);
        }

        // Lunch breaks, one seller at a time.
        foreach ($working as $n => $who) {
            $this->add($at('12:00', $n * 35), 'break_start', $who, [], null, ["{$tag}-open"]);
            $this->add($at('12:30', $n * 35), 'break_end', $who, [], null, ["{$tag}-open"]);
        }

        // Shift change: the opener leaves at two and hands the shop key to the closer.
        $this->add($at('14:00'), 'shop_key', $plan['opener'], ['to' => $plan['closer'], 'reason' => 'shift_change']);
        $this->add($at('14:05'), 'clock_out', $plan['opener'], [], null, ["{$tag}-open"]);
        if (in_array($middle, $working, true)) {
            $this->add($at('17:00'), 'clock_out', $middle, [], null, ["{$tag}-open"]);
        }

        // Shelf refills from the floor, morning and afternoon.
        $this->add($at('10:30'), 'shelf_refill', 'keeper', ['lines' => 4], null, ["{$tag}-open"]);
        $this->add($at('15:30'), 'shelf_refill', 'keeper', ['lines' => 4], null, ["{$tag}-open"]);

        $this->sales($rand, $tag, $open->addMinutes(15), $close->subMinutes(25), $working, $plan, $i);

        // One-off days.
        if ($i === 2) {
            $this->add($at('09:30'), 'expense', $plan['driver'], ['category' => 'fuel', 'amount' => 1800, 'note' => 'Diesel for the van', 'till' => false], "{$tag}-fuel");
            $this->add($at('11:30'), 'expense_confirm', 'finance', ['of' => "{$tag}-fuel"], null, ["{$tag}-fuel"]);
        }
        if ($i === 4) {
            $this->add($at('10:00'), 'expense', 'manager', ['category' => 'utilities', 'amount' => 450, 'note' => 'Water bill, paid from the till', 'till' => true], "{$tag}-water");
            $this->add($at('13:00'), 'expense_confirm', 'finance', ['of' => "{$tag}-water"], null, ["{$tag}-water"]);
        }
        if ($i === 3 || $i === 5) {
            foreach ([0, 1] as $n) {
                $this->add($at('16:00', $n * 20), 'repay', $working[$n % count($working)], ['customer' => $n + ($i === 5 ? 2 : 0), 'method' => $n === 0 ? 'cash' : 'bank'], "{$tag}-repay{$n}", ["{$tag}-open"]);
                $this->add($at('16:30', $n * 20), 'confirm_repayment', 'manager', ['of' => "{$tag}-repay{$n}"], null, ["{$tag}-repay{$n}"]);
            }
        }
        if ($next !== null && ($nextPlan['swapped'] ?? null) !== null) {
            // Tomorrow's middle seller gives that shift to the one who is off; the manager approves.
            $this->add($at('15:00'), 'swap', 'manager', ['from' => $nextPlan['middle'], 'to' => $nextPlan['swapped'], 'date' => $next->toDateString()]);
        }
        if ($countDay) {
            $this->add($at('16:30'), 'stock_count', 'keeper', ['lines' => 6, 'short' => 2], "{$tag}-count", ["{$tag}-open"]);
            $this->add($at('17:00'), 'stock_count_post', 'manager', ['of' => "{$tag}-count"], null, ["{$tag}-count"]);
        }

        // Closing: cash to the manager, the till counted, everyone out; the closer keeps the key.
        // Each seller hands their cash over before their shift ends.
        foreach ($working as $who) {
            $handOver = match ($who) {
                $plan['opener'] => $at('13:50'),
                $plan['closer'] => $close->subMinutes(20),
                default => $at('16:50'),
            };
            $this->add($handOver, 'remit', $who, [], "{$tag}-remit-{$who}", ["{$tag}-open"]);
            $this->add($handOver->addMinutes(8), 'confirm_remit', 'manager', ['of' => "{$tag}-remit-{$who}"], null, ["{$tag}-remit-{$who}"]);
        }
        $overtime = ! empty($plan['overtime']);
        $closeAt = $overtime ? $close->addMinutes(75) : $close->addMinutes(5);
        $this->add($closeAt, 'close_day', $plan['closer'], ['short' => $i === 4 ? 50 : 0], "{$tag}-close", ["{$tag}-open"]);
        if ($overtime) {
            $this->add($closeAt->addMinutes(10), 'overtime', 'manager', ['person' => $plan['closer'], 'date' => $d], null, ["{$tag}-close"]);
        }
        // The closer gets a ride home with the day's driver.
        $this->add($closeAt->addMinutes(15), 'ride_home', $plan['driver'], ['rider' => $plan['closer']], null, ["{$tag}-close"]);
        $this->add($closeAt->addMinutes(30), 'end_of_day', 'admin', []);
    }

    /**
     * Receipts adding up to about 100,000 birr, busiest at lunch and late
     * afternoon. 90% go to business accounts; the five credit customers mostly
     * buy on credit.
     *
     * @param  array<int, string>  $working
     * @param  array<string, ?string>  $plan
     */
    private function sales(Randomizer $rand, string $tag, CarbonImmutable $from, CarbonImmutable $to, array $working, array $plan, int $i): void
    {
        $target = self::SALES_TARGET * (0.96 + $rand->getInt(0, 6) / 100);
        $planned = 0.0;
        $receipts = [];
        $goods = $this->cast->goods;

        while ($planned < $target) {
            $business = $rand->getInt(1, 100) <= 90;
            $credit = $business && $rand->getInt(1, 100) <= 18;
            // The week's first credit sales go to the customer who will never pay them back.
            // And once more on the fifth open day, by when they are overdue: the app refuses it.
            $overdue = $credit && ($this->firstCredit-- > 0 || ($i === 4 && ! isset($this->used["{$tag}overdue"])));
            if ($overdue && $i === 4) {
                $this->used["{$tag}overdue"] = true;
            }
            $customer = $credit
                ? ($overdue ? end($this->cast->credit) : $this->cast->credit[$rand->getInt(0, count($this->cast->credit) - 1)])
                : ($business ? $this->cast->businesses[$rand->getInt(5, count($this->cast->businesses) - 1)] : $this->cast->individuals[$rand->getInt(0, count($this->cast->individuals) - 1)]);

            $lines = [];
            $value = 0.0;
            $count = $business ? $rand->getInt(1, 3) : $rand->getInt(1, 2);
            foreach ($rand->pickArrayKeys($goods, $count) as $key) {
                $qty = $business ? $rand->getInt(1, 3) : 1;
                $lines[] = ['store_variant_id' => $goods[$key]['store_variant_id'], 'item_variant_id' => $goods[$key]['item_variant_id'], 'quantity' => $qty];
                $value += $goods[$key]['price'] * $qty;
            }

            if ($value > 12000) {
                continue;
            }

            $planned += $value;
            $receipts[] = [$customer, $lines, $credit, $overdue];
        }

        // Times: weights per hour of the shop day (lunch and late afternoon peak).
        $minutes = max(60, (int) $from->diffInMinutes($to));
        $times = [];
        foreach ($receipts as $_) {
            do {
                $m = $rand->getInt(0, $minutes);
                $hour = (int) $from->addMinutes($m)->setTimezone(LocalTime::zone())->format('G');
                $weight = match (true) {
                    $hour >= 12 && $hour < 14 => 100,
                    $hour >= 16 => 90,
                    $hour < 9 => 35,
                    default => 60,
                };
            } while ($rand->getInt(1, 100) > $weight);
            $times[] = $m;
        }
        sort($times);

        foreach ($receipts as $n => [$customer, $lines, $credit, $overdue]) {
            $at = $from->addMinutes($times[$n])->addSeconds($rand->getInt(0, 59));
            $seller = $working[$rand->getInt(0, count($working) - 1)];
            // Before two the opener is in, after it the closer: nobody sells off shift.
            $hour = (int) $at->setTimezone(LocalTime::zone())->format('G');
            $onShift = fn (string $who): bool => match ($who) {
                $plan['opener'] => $hour < 14,
                $plan['closer'] => $hour >= 11,
                default => $hour >= 9 && $hour < 17,
            };
            if (! $onShift($seller)) {
                $seller = $hour < 14 ? $plan['opener'] : $plan['closer'];
            }

            $split = $overdue ? 'credit' : ($credit ? self::CREDIT_SPLITS[$this->saleNo % count(self::CREDIT_SPLITS)] : self::SPLITS[$this->saleNo % count(self::SPLITS)]);
            $roll = $rand->getInt(1, 100);
            $method = $roll <= 60 ? 'store' : ($roll <= 90 ? 'courier' : 'vehicle');
            $this->saleNo++;

            $this->saleEvents($rand, "{$tag}-s{$n}", $at, $seller, $customer, $lines, $split, $method, $plan['driver'], [
                // The day's set pieces, on the first fitting sale after ten.
                'reject' => $i === 2 && $split === 'bank' && $hour >= 10,
                'cancel' => $i === 1 && $split === 'bank' && $hour >= 11,
                'fail' => $i === 3 && $method === 'courier' && $hour >= 11,
            ], $tag);
        }
    }

    /**
     * One receipt and what follows it: the customer pays, a second person
     * confirms, the order is picked and packed, then handed over or driven out.
     *
     * @param  array<int, array<string, int>>  $lines
     * @param  array{reject: bool, cancel: bool, fail: bool}  $once
     */
    private function saleEvents(Randomizer $rand, string $ref, CarbonImmutable $at, string $seller, Customer $customer, array $lines, string $split, string $method, string $driver, array $once, string $tag): void
    {
        foreach ($once as $what => $wanted) {
            $once[$what] = $wanted && ! isset($this->used[$tag.$what]);
            if ($once[$what]) {
                $this->used[$tag.$what] = true;
                // A cancelled order is a delivery the customer gave up on; keep it simple.
                if ($what === 'cancel') {
                    $method = 'courier';
                }
            }
        }

        $this->add($at, 'sale', $seller, [
            'customer_id' => (int) $customer->id,
            'lines' => $lines,
            'split' => $split === 'later' ? '' : $split,
            'method' => $method,
            'driver' => $driver,
        ], $ref);

        $t = $at;
        $parts = $split === 'later' ? ['bank'] : explode('+', $split);

        if ($split === 'later') {
            // "Pay later": the customer comes back within the hour and pays by transfer.
            $t = $t->addMinutes($rand->getInt(20, 50));
            $this->add($t, 'pay', $seller, ['of' => $ref, 'split' => 'bank'], null, [$ref]);
        }

        if ($once['cancel']) {
            $this->add($t->addMinutes(25), 'cancel', $seller, ['of' => $ref], null, [$ref]);

            return;
        }

        $done = $t->addMinutes(1);
        foreach ($parts as $part) {
            if ($part === 'cash') {
                // Cash is in the seller's hand; the manager confirms it.
                $c = $t->addMinutes($rand->getInt(2, 6));
                $this->add($c, 'confirm', 'manager', ['of' => $ref, 'method' => 'cash'], null, [$ref]);
                $done = max($done, $c);
            } elseif ($part === 'bank' || $part === 'wallet') {
                $owner = $part === 'bank' ? 'manager' : 'finance';
                $claim = $t->addMinutes($rand->getInt(1, 4));
                $this->add($claim, 'claim', $seller, ['of' => $ref, 'method' => $part], null, [$ref]);
                $c = $claim->addMinutes($rand->getInt(4, 25));
                if ($once['reject'] && $part === 'bank') {
                    // The transfer is not there yet: rejected, the customer sends it again.
                    $this->add($c, 'reject', $owner, ['of' => $ref, 'method' => $part], null, [$ref]);
                    $this->add($c->addMinutes(10), 'claim', $seller, ['of' => $ref, 'method' => $part], null, [$ref]);
                    $c = $c->addMinutes(30);
                }
                $this->add($c, 'confirm', $owner, ['of' => $ref, 'method' => $part], null, [$ref]);
                $done = max($done, $c);
            }
        }

        // Pick & pack: the store keeper (or the seller, when it is the counter).
        $picker = $method === 'store' ? $seller : 'keeper';
        $packed = $done->addMinutes($rand->getInt(2, 8));
        $this->add($packed, 'pick_pack', $picker, ['of' => $ref], null, [$ref]);

        if ($method === 'courier') {
            $out = $packed->addMinutes($rand->getInt(15, 45));
            $this->add($out, 'deliver', $driver, ['of' => $ref, 'step' => 'dispatched'], null, [$ref]);
            $this->add($out->addMinutes(5), 'deliver', $driver, ['of' => $ref, 'step' => 'in_transit'], null, [$ref]);
            if ($once['fail']) {
                $this->add($out->addMinutes(40), 'deliver', $driver, ['of' => $ref, 'step' => 'failed', 'reason' => 'Customer not at the address'], null, [$ref]);
                $this->add($out->addMinutes(70), 'deliver', $driver, ['of' => $ref, 'step' => 'returned'], null, [$ref]);
            } else {
                $this->add($out->addMinutes($rand->getInt(20, 50)), 'deliver', $driver, ['of' => $ref, 'step' => 'delivered'], null, [$ref]);
            }
        } elseif ($method === 'vehicle') {
            // The customer's own vehicle collects at the store.
            $out = $packed->addMinutes($rand->getInt(10, 40));
            $this->add($out, 'deliver', 'keeper', ['of' => $ref, 'step' => 'dispatched'], null, [$ref]);
            $this->add($out->addMinutes(2), 'deliver', 'keeper', ['of' => $ref, 'step' => 'in_transit'], null, [$ref]);
            $this->add($out->addMinutes(3), 'deliver', 'keeper', ['of' => $ref, 'step' => 'delivered'], null, [$ref]);
        }
    }

    /** @return array{0: string, 1: string}|null shop opening and closing (HH:MM), null on a closed day */
    private function hours(CarbonImmutable $date): ?array
    {
        $hours = $this->sites->hoursOn($this->cast->site, $date->toDateString());

        if ($hours !== null && $hours['closed']) {
            return null;
        }

        return [substr((string) ($hours['opens_at'] ?? '08:00'), 0, 5), substr((string) ($hours['closes_at'] ?? '19:00'), 0, 5)];
    }

    /**
     * @param  array<string, mixed>  $args
     * @param  array<int, string>  $needs
     */
    private function add(CarbonImmutable $at, string $kind, string $as, array $args, ?string $ref = null, array $needs = []): void
    {
        $this->events[] = [
            'at' => $at->utc()->format('Y-m-d\TH:i:s\Z'),
            'seq' => count($this->events),
            'kind' => $kind,
            'as' => $as,
            'args' => $args,
            'ref' => $ref,
            'needs' => $needs,
        ];
    }
}
