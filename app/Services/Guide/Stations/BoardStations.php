<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Fulfillment\Vehicle;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\Shift;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\Sites;

/**
 * The staff board on the office wall: for each site a person works at (a
 * manager or admin: every site they manage), who is on shift today and in the
 * next two days, when it opens, and who holds its key; and every vehicle key
 * with its holder. Nothing to do here (the Staff & keys desk takes the
 * actions), so it is read only: one item per site or car.
 */
class BoardStations
{
    use BuildsStations;

    public function __construct(
        private readonly Sites $sites,
        private readonly KeyCustodyService $keys,
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

        foreach ($worked->all() + $managed->all() as $site) {
            /** @var StockLocation $site */
            if (! $this->sites->hasShifts($site)) {
                continue;
            }

            $shifts = Shift::query()->sent()->where('stock_location_id', $site->id)
                ->where('ends_at', '>', $from->utc())->where('starts_at', '<', $to->utc())
                ->with('user')->orderBy('starts_at')->limit(40)->get();

            $hours = $this->sites->hoursOn($site, $from);
            $key = $this->keys->present($this->keys->keyFor($site), $viewer);

            $lines = [];
            $day = null;

            foreach ($shifts as $shift) {
                $d = LocalTime::wall($shift->starts_at, 'D j M');

                if ($d !== $day) {
                    $day = $d;
                    $lines[] = '— '.$d;
                }

                $lines[] = $this->person($shift->user).'  '.LocalTime::wall($shift->starts_at, 'H:i').'–'.LocalTime::wall($shift->ends_at, 'H:i')
                    .($shift->duty === Shift::DUTY_OPENER ? ' · opens' : ($shift->duty === Shift::DUTY_CLOSER ? ' · closes' : ''))
                    .($shift->status === Shift::STATUS_ACCEPTED ? '' : ' · not accepted yet');
            }

            $items[] = [
                'id' => 'site-'.$site->id,
                'title' => (string) $site->name,
                'subtitle' => ($hours === null || $hours['closed'] ? 'Closed today' : 'Open '.$hours['opens_at'].'–'.$hours['closes_at'])
                    .' · key: '.($key['holder']['name'] ?? 'nobody'),
                'lines' => $lines === [] ? ['No shift in the next three days.'] : $lines,
                'chips' => array_values(array_filter([
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
            'blurb' => 'Who works when, and who holds each key. The Staff & keys desk takes the actions.',
            'empty' => 'No shifts or keys to show.',
            // To read, not to do: it is never counted as work waiting.
            'info' => true,
        ])];
    }
}
