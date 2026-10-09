<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Auth\User;
use App\Models\Fulfillment\Delivery;
use App\Services\Admin\ActiveStore;
use App\Services\DeliveryService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Every customer delivery run: who carries it, where it stands, and an admin
 * hand to put a courier on a picked order nobody has claimed.
 */
class DeliveryController extends Controller
{
    public function __construct(
        private readonly DeliveryService $deliveries,
        private readonly ActiveStore $activeStore,
    ) {
    }

    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString() ?: 'open';

        // A delivery has no store of its own: it is its order's.
        $scoped = fn () => $this->activeStore->applyThrough(Delivery::query(), 'sale');

        $paginator = $scoped()
            ->with(['sale.store', 'courier'])
            ->when($status === 'open', fn ($q) => $q->open())
            ->when($status === 'unassigned', fn ($q) => $q->unassigned()->readyToCollect()->where('status', DeliveryService::STATUS_PENDING))
            ->when(! in_array($status, ['open', 'unassigned', 'all'], true), fn ($q) => $q->where('status', $status))
            ->latest('id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('Admin/Deliveries/Index', [
            'deliveries' => collect($paginator->items())->map(fn (Delivery $d): array => [
                'id' => (int) $d->id,
                'tracking_number' => $d->tracking_number,
                'status' => (string) $d->status,
                'order' => $d->sale?->reference_number,
                'store' => $d->sale?->store?->name,
                'recipient' => $d->recipient_name,
                'address' => $d->delivery_address,
                'courier' => $d->courier ? trim($d->courier->first_name.' '.$d->courier->last_name) : null,
                'ready' => $d->sale === null || $d->sale->sourcing_confirmed_at !== null,
                'failure_reason' => $d->failure_reason,
                'updated_at' => $d->updated_at?->toIso8601String(),
            ])->values(),
            'filters' => ['status' => $status],
            'counts' => [
                'open' => $scoped()->open()->count(),
                'unassigned' => $scoped()->unassigned()->readyToCollect()->where('status', DeliveryService::STATUS_PENDING)->count(),
                'failed' => $scoped()->where('status', DeliveryService::STATUS_FAILED)->count(),
                'delivered' => $scoped()->where('status', DeliveryService::STATUS_DELIVERED)->count(),
            ],
            'couriers' => $this->couriers()->orderBy('first_name')->get(['users.id', 'first_name', 'last_name'])
                ->map(fn (User $u): array => ['id' => (int) $u->id, 'name' => trim($u->first_name.' '.$u->last_name)])->values(),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    /** Put a courier on a picked order nobody has claimed yet. */
    public function assign(Request $request, Delivery $delivery): RedirectResponse
    {
        $storeId = $delivery->sale?->store_id;
        abort_unless($this->activeStore->allows($storeId !== null ? (int) $storeId : null), 404);

        $courierId = (int) $request->validate([
            'courier_id' => ['required', 'integer', 'exists:users,id'],
        ])['courier_id'];

        $courier = User::query()->findOrFail($courierId);

        if (! $this->couriers()->whereKey($courierId)->exists() && $courier->roleKey() === 'delivery') {
            return back()->with('error', 'That courier works for another store.');
        }

        if ($courier->roleKey() !== 'delivery') {
            return back()->with('error', 'Only a delivery courier can carry a run.');
        }

        if (! $this->deliveries->claim($delivery, $courier)) {
            return back()->with('error', 'That run is already taken, not picked yet, or no longer pending.');
        }

        return back()->with('success', "{$courier->first_name} is carrying {$delivery->tracking_number}.");
    }

    /**
     * Couriers the user may put on a run: the scoped stores' own couriers plus
     * the shared pool (couriers attached to no store). A global admin on "All
     * stores" sees every courier.
     */
    private function couriers(): \Illuminate\Database\Eloquent\Builder
    {
        $ids = $this->activeStore->scopeIds();

        return User::role('delivery')
            ->when($ids !== null, fn ($q) => $q->where(fn ($inner) => $inner->whereIn('users.store_id', $ids ?: [0])->orWhereNull('users.store_id')));
    }
}
