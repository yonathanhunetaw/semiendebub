<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Controller;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Services\DeliveryService;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The driver's home screen: today's workload at a glance, the next few runs
 * waiting on them, and what is being picked and packed for them right now.
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
            ->visibleToCourier()
            ->open()
            // CASE, not FIELD(): FIELD() is MySQL-only and the test
            // suite runs on SQLite, where this query would error.
            ->orderByRaw("CASE status WHEN 'in_transit' THEN 0 WHEN 'dispatched' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END")
            ->orderBy('scheduled_for')
            ->limit(5)
            ->get()
            ->map(fn (Delivery $delivery) => $this->deliveries->present($delivery))
            ->values()
            ->all();

        $availableRuns = Delivery::query()
            ->with('sale')
            ->unassigned()
            ->readyToCollect()
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
            'being_packed' => $this->beingPacked((int) $courier->id),
            'courier' => [
                'id' => (int) $courier->id,
                'name' => trim($courier->first_name . ' ' . $courier->last_name),
                'email' => $courier->email,
            ],
        ]);
    }

    /**
     * Orders a seller or stock keeper has started picking, for this courier
     * or still open to any courier: how far along they are, so the driver
     * knows what is coming before it is handed over. The screen polls it.
     *
     * @return array<int, array<string, mixed>>
     */
    private function beingPacked(int $courierId): array
    {
        return Delivery::query()
            ->with(['sale.store:id,name', 'sale.items:id,sale_id,ticked_at'])
            ->where('status', DeliveryService::STATUS_PENDING)
            ->where(fn ($q) => $q->where('courier_id', $courierId)->orWhereNull('courier_id'))
            ->whereHas('sale', fn ($sale) => $sale
                ->where('fulfillment_stage', Sale::STAGE_PICK_PACK)
                ->whereNotNull('picking_started_at'))
            ->latest('updated_at')
            ->limit(8)
            ->get()
            ->map(fn (Delivery $delivery): array => [
                'id' => (int) $delivery->id,
                'tracking_number' => $delivery->tracking_number,
                'reference' => $delivery->sale?->reference_number,
                'store' => $delivery->sale?->store?->name,
                'method' => (string) ($delivery->method ?: Delivery::METHOD_COURIER),
                'address' => $delivery->delivery_address,
                'plate' => $delivery->vehicle_plate,
                'mine' => (int) $delivery->courier_id === $courierId,
                'lines' => $delivery->sale?->items->count() ?? 0,
                'in_hand' => $delivery->sale?->items->whereNotNull('ticked_at')->count() ?? 0,
                'packed' => $delivery->sale?->packed_at !== null,
                'paid' => (bool) $delivery->sale?->isFullyPaid(),
                'started_at' => $delivery->sale?->picking_started_at?->toIso8601String(),
            ])
            ->values()
            ->all();
    }
}
