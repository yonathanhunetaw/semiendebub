<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Controller;
use App\Models\Fulfillment\Delivery;
use App\Services\DeliveryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Closed last-mile deliveries — what this courier delivered, and what failed.
 *
 * Distinct from FreightController, which handles inter-store shipments.
 */
class ShipmentController extends Controller
{
    public function __construct(private readonly DeliveryService $deliveries)
    {
    }

    public function index(Request $request): Response
    {
        $courier = Auth::user();
        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';

        $paginator = $this->deliveries->paginateHistory(
            $courier,
            $search !== '' ? $search : null,
        );

        return Inertia::render('Delivery/History/index', [
            'shipments' => collect($paginator->items())
                ->map(fn (Delivery $delivery) => $this->deliveries->present($delivery))
                ->values()
                ->all(),
            'metrics' => $this->deliveries->metrics($courier),
            'filters' => ['search' => $search],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }
}
