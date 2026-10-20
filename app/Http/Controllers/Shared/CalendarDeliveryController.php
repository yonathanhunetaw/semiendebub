<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Http\Requests\Calendar\ScheduleDeliveryRequest;
use App\Models\Fulfillment\Delivery;
use App\Services\Admin\ActiveStore;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\Sources\DeliverySource;
use App\Services\DeliveryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Move a delivery to another day from its sheet on the calendar. Who may is
 * DeliverySource::canSchedule (the store's staff and admins in view, or the
 * courier carrying it); the run must not be on the road yet.
 */
class CalendarDeliveryController extends Controller
{
    public function schedule(ScheduleDeliveryRequest $request, Delivery $delivery, DeliverySource $deliveries, DeliveryService $service): RedirectResponse
    {
        abort_unless($deliveries->canSchedule($this->scope($request), $delivery->loadMissing('sale:id,store_id')), 404);

        if (! $service->schedule($delivery, $request->user(), $request->moment())) {
            return back()->with('error', 'This delivery is already on the road or finished, so its day can no longer change.');
        }

        return back()->with('success', 'Delivery day saved.');
    }

    private function scope(Request $request): CalendarScope
    {
        $app = explode('.', (string) $request->route()?->getName())[0];
        abort_unless(in_array($app, CalendarScope::APPS, true), 404);

        return CalendarScope::for($app, $request->user(), $app === 'admin' ? app(ActiveStore::class) : null);
    }
}
