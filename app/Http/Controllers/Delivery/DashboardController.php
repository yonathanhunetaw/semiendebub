<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Controller;
use App\Models\Fulfillment\Delivery;
use App\Services\DeliveryService;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The driver's home screen: today's workload at a glance plus the next few
 * runs waiting on them.
 */
class DashboardController extends Controller
{
    public function __construct(private readonly DeliveryService $deliveries)
    {
    }

    public function index(): Response
    {
        $courier = Auth::user();

        $upNext = Delivery::query()
            ->with('sale')
            ->forCourier((int) $courier->id)
            ->open()
            ->orderByRaw("FIELD(status, 'in_transit', 'dispatched', 'pending')")
            ->orderBy('scheduled_for')
            ->limit(5)
            ->get()
            ->map(fn (Delivery $delivery) => $this->deliveries->present($delivery))
            ->values()
            ->all();

        $availableRuns = Delivery::query()
            ->with('sale')
            ->unassigned()
            ->where('status', DeliveryService::STATUS_PENDING)
            ->orderBy('scheduled_for')
            ->limit(5)
            ->get()
            ->map(fn (Delivery $delivery) => $this->deliveries->present($delivery))
            ->values()
            ->all();

        return Inertia::render('Delivery/Dashboard/index', [
            'metrics' => $this->deliveries->metrics($courier),
            'up_next' => $upNext,
            'available_runs' => $availableRuns,
            'courier' => [
                'id' => (int) $courier->id,
                'name' => trim($courier->first_name . ' ' . $courier->last_name),
                'email' => $courier->email,
            ],
        ]);
    }
}
