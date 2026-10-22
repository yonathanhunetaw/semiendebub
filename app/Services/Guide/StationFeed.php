<?php

declare(strict_types=1);

namespace App\Services\Guide;

use App\Models\Auth\User;
use App\Services\Guide\Stations\CountStations;
use App\Services\Guide\Stations\DeliveryStations;
use App\Services\Guide\Stations\IdeaStations;
use App\Services\Guide\Stations\MoneyStations;
use App\Services\Guide\Stations\OverviewStations;
use App\Services\Guide\Stations\PurchasingStations;
use App\Services\Guide\Stations\ShipmentStations;
use App\Services\Guide\Stations\WorkStations;
use App\Services\Guide\Stations\MoveStations;
use App\Services\Guide\Stations\OrderStations;
use App\Services\Guide\Stations\ReceivingStations;

/**
 * The desks of the Guide's world (resources/js/Components/Guide/world/game/stations.ts):
 * every module that is not a walk-and-carry job, as a list of what it has
 * waiting for this viewer and the actions its own page offers.
 *
 * Nothing here writes. Each action names a real route on the viewer's own
 * app (`url`, `method`, fixed `data`, the `fields` to fill in), so when the
 * world posts it the route's own request, policy and service decide, exactly
 * as for the page's button. An action is only offered when the viewer may
 * take it; the route still checks again.
 *
 * Each station says which desk it stands at (`desk`, a key of zones.ts DESKS).
 * The areas live in App\Services\Guide\Stations, one provider each.
 */
class StationFeed
{
    /** @var array<int, class-string> */
    private const PROVIDERS = [
        ReceivingStations::class,
        OrderStations::class,
        CountStations::class,
        MoveStations::class,
        DeliveryStations::class,
        MoneyStations::class,
        PurchasingStations::class,
        ShipmentStations::class,
        IdeaStations::class,
        WorkStations::class,
        OverviewStations::class,
    ];

    /**
     * @param  string  $app  the viewer's app: admin, seller, stock_keeper, delivery
     * @param  int  $storeId  the Main Store, the only one the world draws
     * @param  array<string, mixed>  $shelving  RefillBoard::shelvingList for this viewer (the shelf, its bins that need stock)
     * @return array<int, array<string, mixed>>
     */
    public function for(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $stations = [];

        foreach (self::PROVIDERS as $provider) {
            foreach (app($provider)($viewer, $app, $storeId, $shelving) as $station) {
                if (is_array($station)) {
                    $stations[] = $station;
                }
            }
        }

        return $stations;
    }
}
