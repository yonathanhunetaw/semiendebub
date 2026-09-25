<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Controller;
use App\Http\Requests\Delivery\TransitionDeliveryRequest;
use App\Models\Fulfillment\Delivery;
use App\Services\DeliveryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The courier's active run list, and the status transitions they drive.
 */
class DeliveryController extends Controller
{
    public function __construct(private readonly DeliveryService $deliveries)
    {
    }

    public function index(Request $request): Response
    {
        $courier = Auth::user();

        $status = $request->string('status')->toString() ?: 'open';
        $search = $request->filled('search') ? trim((string) $request->string('search')) : '';

        $paginator = $this->deliveries->paginateForCourier(
            $courier,
            $status,
            $search !== '' ? $search : null,
        );

        $available = $this->deliveries->paginateUnassigned(null, 10);

        return Inertia::render('Delivery/Delivery/index', [
            'deliveries' => collect($paginator->items())
                ->map(fn (Delivery $delivery) => $this->deliveries->present($delivery))
                ->values()
                ->all(),
            'available_runs' => collect($available->items())
                ->map(fn (Delivery $delivery) => $this->deliveries->present($delivery))
                ->values()
                ->all(),
            'metrics' => $this->deliveries->metrics($courier),
            'filters' => ['status' => $status, 'search' => $search],
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /**
     * Claim a run from the unassigned pool.
     */
    public function claim(Delivery $delivery): RedirectResponse
    {
        if (! $this->deliveries->claim($delivery, Auth::user())) {
            return back()->with('error', 'That run has already been taken.');
        }

        return back()->with('success', 'Run assigned to you.');
    }

    /**
     * Advance a run along its lifecycle.
     */
    public function transition(TransitionDeliveryRequest $request, Delivery $delivery): RedirectResponse
    {
        // A courier may only drive their own runs.
        if ((int) $delivery->courier_id !== (int) Auth::id()) {
            return back()->with('error', 'That run is not assigned to you.');
        }

        $to = (string) $request->validated('status');

        $extra = $to === DeliveryService::STATUS_FAILED
            ? ['failure_reason' => $request->validated('failure_reason')]
            : [];

        if (! $this->deliveries->transition($delivery, $to, $extra)) {
            return back()->with('error', "A run cannot move from {$delivery->status} to {$to}.");
        }

        return back()->with('success', 'Run updated.');
    }
}
