<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Http\Requests\Guide\WorldShipmentsRequest;
use App\Services\Guide\WorldFeed;
use Illuminate\Http\JsonResponse;

/**
 * What the Guide's 3D world replays, as JSON: the day's shipments, refills
 * and orders. Served on every app
 * that has the Guide (admin, seller, stock keeper, delivery) behind that
 * app's own role gate; a user tied to a store sees only that store's.
 * `?shelf=1` adds the Main Store's 200 shelf bins as they stand now.
 */
class GuideWorldController extends Controller
{
    public function __invoke(WorldShipmentsRequest $request, WorldFeed $feed): JsonResponse
    {
        $payload = $feed->between($request->from(), $request->to(), $request->user());
        $payload['refills'] = $feed->refills($request->from(), $request->to(), $request->user());
        $payload['orders'] = $feed->orders($request->from(), $request->to(), $request->user());

        // The shelf is always as it stands now; only fetched when asked for.
        if ($request->boolean('shelf')) {
            $payload['shelf'] = $feed->shelf($request->user());
        }

        return response()->json($payload);
    }
}
