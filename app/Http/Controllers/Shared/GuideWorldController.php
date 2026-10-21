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
 * `?play=1` returns only what the Play mode can pick up now (WorldFeed::play).
 */
class GuideWorldController extends Controller
{
    public function __invoke(WorldShipmentsRequest $request, WorldFeed $feed): JsonResponse
    {
        // Play asks only for what it can pick up now; the day's replay is not needed.
        if ($request->boolean('play')) {
            return response()->json(['play' => $feed->play($request->user())]);
        }

        $payload = $feed->between($request->from(), $request->to(), $request->user());
        $payload['refills'] = $feed->refills($request->from(), $request->to(), $request->user());
        $payload['orders'] = $feed->orders($request->from(), $request->to(), $request->user());
        $payload['events'] = $feed->events($request->from(), $request->to(), $request->user());

        // The shelf is always as it stands now; only fetched when asked for.
        if ($request->boolean('shelf')) {
            $payload['shelf'] = $feed->shelf($request->user());
        }

        return response()->json($payload);
    }
}
