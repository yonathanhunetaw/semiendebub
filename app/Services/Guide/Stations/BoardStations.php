<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\Shift;
use App\Models\Workforce\SiteDay;
use App\Models\Workforce\SiteDayAnswer;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;

/**
 * The staff board on the office wall: for each site a person works at (a
 * manager or admin: every site they manage), today and the next two days:
 * who opens, closes and drives it and whether each said yes (✓), can't (✗,
 * with why) or has not answered (?), then who is on shift; when it opens and
 * who holds its key; and every vehicle key with its holder. Nothing to do here
 * (My work and the Staff & keys desk take the actions), so it is read only:
 * one item per site or car.
 */
class BoardStations
{
    use BuildsStations;

    public function __construct(
        private readonly Sites $sites,
        private readonly KeyCustodyService $keys,
        private readonly SiteDayService $days,
    ) {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        if (! in_array($app, ['admin', 'seller', 'stock_keeper', 'delivery'], true)) {
            return [];
        }

        $from = LocalTime::today();
        $to = $from->addDays(3);
        $items = [];

        $managed = $this->sites->managedBy($viewer)->keyBy('id');
        $worked = $this->sites->workedAtBy($viewer)->keyBy('id');
        // A driver (or anyone) named to open, close or drive a site in these days sees it too.
        $named = StockLocation::query()->whereIn('id', SiteDay::query()
            ->whereDate('date', '>=', $from->toDateString())->whereDate('date', '<', $to->toDateString())
            ->where(fn ($q) => $q->where('opener_id', $viewer->id)->orWhere('closer_id', $viewer->id)->orWhere('driver_id', $viewer->id))
            ->select('stock_location_id'))->get()->keyBy('id');

        foreach ($worked->all() + $managed->all() + $named->all() as $site) {
            /** @var StockLocation $site */
            if (! $this->sites->hasShifts($site)) {
                continue;
            }

            $shifts = Shift::query()->sent()->where('stock_location_id', $site->id)
                ->where('ends_at', '>', $from->utc())->where('starts_at', '<', $to->utc())
                ->with('user')->orderBy('starts_at')->limit(40)->get();

            $hours = $this->sites->hoursOn($site, $from);
            $key = $this->keys->present($this->keys->keyFor($site), $viewer);
            // Who opens, closes and drives each day, and their answers (read only: no day rows are made).
            $plan = $this->days->weekPlan(collect([$site]), 3)[0]['days'] ?? [];
            $notes = $this->noAnswers($site, $from->toDateString(), $to->toDateString());
            $byDay = $shifts->groupBy(fn (Shift $shift): string => LocalTime::wall($shift->starts_at, 'Y-m-d'));

            $lines = [];
            $cant = 0;

            foreach ($plan as $day) {
                $dayShifts = $byDay->get($day['date'], collect());
                $duties = $this->dutyLine($day, $notes[$day['date']] ?? []);
                $cant += count(array_filter($day['answers'], fn (?string $answer): bool => $answer === SiteDayAnswer::NO));

                if ($duties === null && $dayShifts->isEmpty()) {
                    continue;
                }

                $lines[] = '— '.LocalTime::day($day['date'])->format('D j M');

                if ($duties !== null) {
                    $lines[] = $duties;
                }

                foreach ($dayShifts as $shift) {
                    $lines[] = $this->person($shift->user).'  '.LocalTime::wall($shift->starts_at, 'H:i').'–'.LocalTime::wall($shift->ends_at, 'H:i')
                        .($shift->duty === Shift::DUTY_OPENER ? ' · opens' : ($shift->duty === Shift::DUTY_CLOSER ? ' · closes' : ''))
                        .($shift->status === Shift::STATUS_ACCEPTED ? '' : ' · not accepted yet');
                }
            }

            $items[] = [
                'id' => 'site-'.$site->id,
                'title' => (string) $site->name,
                'subtitle' => ($hours === null || $hours['closed'] ? 'Closed today' : 'Open '.$hours['opens_at'].'–'.$hours['closes_at'])
                    .' · key: '.($key['holder']['name'] ?? 'nobody'),
                'lines' => $lines === [] ? ['No shift in the next three days.'] : $lines,
                'chips' => array_values(array_filter([
                    $cant > 0 ? ['label' => $cant === 1 ? 'Someone can’t' : "{$cant} can’t", 'tone' => 'error'] : null,
                    $key['pending'] !== null ? ['label' => 'Key on its way', 'tone' => 'warning'] : null,
                ])),
                'actions' => [],
            ];
        }

        // The cars' keys.
        foreach (Vehicle::query()->orderBy('name')->limit(12)->get() as $car) {
            $key = $this->keys->present($this->keys->keyFor($car), $viewer);
            $items[] = [
                'id' => 'car-'.$car->id,
                'title' => trim($car->name.' · '.$car->plate),
                'subtitle' => 'Key: '.($key['holder']['name'] ?? 'nobody'),
                'chips' => $key['pending'] !== null ? [['label' => 'Key on its way', 'tone' => 'warning']] : [],
                'actions' => [],
            ];
        }

        return [$this->station('board', 'Staff board', 'desk_board', $items, [
            'blurb' => 'Who opens, closes and drives, and whether they said yes; who works when, and who holds each key. My work and the Staff & keys desk take the actions.',
            'empty' => 'No shifts or keys to show.',
            // To read, not to do: it is never counted as work waiting.
            'info' => true,
        ])];
    }

    /**
     * "Opens Abel ✓ · Closes Sara ? · Drives Dawit ✗ (car at the garage)", or
     * "Closed" on a closed day; null when nobody is named for anything.
     *
     * @param  array<string, mixed>  $day  One day of SiteDayService::weekPlan.
     * @param  array<string, string|null>  $notes  The reason behind each "no", by duty.
     */
    private function dutyLine(array $day, array $notes): ?string
    {
        if ($day['status'] === SiteDay::STATUS_CLOSED_DAY) {
            return 'Closed';
        }

        $parts = [];

        foreach (['opener' => 'Opens', 'closer' => 'Closes', 'driver' => 'Drives'] as $duty => $label) {
            if ($day[$duty] === null) {
                continue;
            }

            $answer = $day['answers'][$duty] ?? null;
            $mark = $answer === SiteDayAnswer::YES ? '✓' : ($answer === SiteDayAnswer::NO ? '✗' : '?');
            $why = $answer === SiteDayAnswer::NO && filled($notes[$duty] ?? null) ? ' ('.$notes[$duty].')' : '';
            $parts[] = $label.' '.strtok((string) $day[$duty], ' ').' '.$mark.$why;
        }

        return $parts === [] ? null : implode(' · ', $parts);
    }

    /**
     * The reasons behind each "no" at a site between two dates, by date then
     * duty (weekPlan carries only yes / no).
     *
     * @return array<string, array<string, string|null>>
     */
    private function noAnswers(StockLocation $site, string $from, string $to): array
    {
        $notes = [];

        $days = SiteDay::query()->with('answers')->where('stock_location_id', $site->id)
            ->whereDate('date', '>=', $from)->whereDate('date', '<', $to)->get();

        foreach ($days as $day) {
            foreach ($this->days->answersOf($day) as $duty => $answer) {
                if (($answer['answer'] ?? null) === SiteDayAnswer::NO) {
                    $notes[$day->date->toDateString()][$duty] = $answer['note'] ?? null;
                }
            }
        }

        return $notes;
    }
}
