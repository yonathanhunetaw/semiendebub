<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\Inventory\StockLocation;
use App\Services\Workforce\Sites;
use App\Services\Workforce\StaffRideService;

/**
 * What the viewer may start from a day on the calendar, besides a note: a
 * transfer, a shipment, a purchase order, a shift, a staff ride or leave.
 *
 * Each one opens the module's own form with the day filled in: the page adds
 * `new=1`, `date` and `time` (the shops' wall clock), plus the date under
 * every name in `date_params` (the rota wants it as `week`). The module still
 * validates and decides; this list only mirrors who may reach each form:
 * the app's role gate (an app without the route has no starter), the site
 * managers for shifts, StaffRideService::mayRequest for rides.
 */
class CalendarStarters
{
    /** More managed sites than this and the rota's own picker is the better place. */
    private const MAX_SHIFT_SITES = 6;

    public function __construct(
        private readonly Sites $sites,
        private readonly StaffRideService $rides,
    ) {
    }

    /** @return array<int, array{key: string, label: string, icon: string, url: string, date_params: array<int, string>}> */
    public function for(CalendarScope $scope): array
    {
        $app = $scope->app;
        $starters = [];

        $transfer = match ($app) {
            'admin' => CalendarItem::url('admin.inventory.transfers.create'),
            'stock_keeper' => CalendarItem::url('stock_keeper.transfers.index'),
            default => null,
        };
        $this->add($starters, 'transfer', 'Transfer', 'swap_horiz', $transfer);

        $shipment = match ($app) {
            'admin' => CalendarItem::url('admin.inventory.shipments.index'),
            'seller' => CalendarItem::url('seller.shipments.index'),
            default => null,
        };
        $this->add($starters, 'shipment', 'Shipment', 'local_shipping', $shipment);

        // Purchase orders live on the procurement app; admins reach it too.
        if (in_array($app, ['admin', 'procurement'], true)) {
            $this->add($starters, 'purchase_order', 'Purchase order', 'shopping_cart', CalendarItem::url('procurement.purchase_orders.create'));
        }

        if (CalendarItem::url("{$app}.work") === null) {
            return $starters;
        }

        $managed = $this->sites->managedBy($scope->viewer)
            ->filter(fn (StockLocation $site): bool => $app !== 'admin' || $site->store_id === null || $scope->covers((int) $site->store_id))
            ->values();
        if ($managed->count() <= self::MAX_SHIFT_SITES) {
            foreach ($managed as $site) {
                $this->add($starters, "shift:{$site->id}", "Shift at {$site->name}", 'badge', CalendarItem::url("{$app}.work.rota", ['site' => $site->id]), ['date', 'week']);
            }
        } else {
            $this->add($starters, 'shift', 'Shift (pick the site)', 'badge', CalendarItem::url("{$app}.work"));
        }

        // Drivers carry rides and have no leave form on their app.
        if ($app === 'delivery') {
            return $starters;
        }

        $canAsk = $this->sites->workedAtBy($scope->viewer)->contains(fn (StockLocation $site): bool => $this->rides->mayRequest($scope->viewer, $site));
        if ($canAsk) {
            $this->add($starters, 'ride', 'Staff ride', 'airport_shuttle', CalendarItem::url("{$app}.work.rides"));
        }

        $this->add($starters, 'leave', 'Leave', 'beach_access', CalendarItem::url("{$app}.work"));

        return $starters;
    }

    /**
     * @param  array<int, array<string, mixed>>  $starters
     * @param  array<int, string>  $dateParams
     */
    private function add(array &$starters, string $key, string $label, string $icon, ?string $url, array $dateParams = ['date']): void
    {
        if ($url !== null) {
            $starters[] = ['key' => $key, 'label' => $label, 'icon' => $icon, 'url' => $url, 'date_params' => $dateParams];
        }
    }
}
