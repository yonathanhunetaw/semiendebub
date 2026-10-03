<?php

declare(strict_types=1);

namespace App\Http\Controllers\Delivery;

use App\Http\Controllers\Controller;
use App\Models\StockKeeper\Transfer;
use App\Services\TransferWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The courier's side of a transfer between two sites (STOCK_PLAN.md phase 4).
 *
 *   claim     take on a transfer nobody is carrying yet
 *   (origin)  the origin's staff dispatch it — that is the hand-off to the
 *             courier, and the goods move into Delivery's custody
 *   handover  give the goods to the destination; they land there
 *
 * Same-site moves (a store's floor to its shelf) never appear here: staff
 * carry those across themselves.
 */
class TransferController extends Controller
{
    public function __construct(private readonly TransferWorkflowService $workflow)
    {
    }

    public function index(Request $request): Response
    {
        $courierId = (int) Auth::id();
        $tab = $request->string('tab')->toString() ?: 'all';

        $candidates = Transfer::query()
            ->active()
            ->with(['itemVariant.item', 'fromStore', 'toStore', 'initiator', 'courier'])
            ->where(fn ($q) => $q
                ->where('courier_id', $courierId)
                ->orWhere(fn ($open) => $open->whereNull('courier_id')->where('status', TransferWorkflowService::STATUS_PENDING)))
            ->whereNotIn('status', [TransferWorkflowService::STATUS_COMPLETED, TransferWorkflowService::STATUS_CANCELLED])
            ->orderByDesc('id')
            ->limit(200)
            ->get()
            // Only legs that leave their site need a courier.
            ->filter(fn (Transfer $transfer): bool => $this->workflow->needsCourier($transfer));

        $mine = $candidates->where('courier_id', $courierId);
        $pool = $candidates->whereNull('courier_id');

        $shown = match ($tab) {
            'mine' => $mine,
            'available' => $pool,
            default => $candidates,
        };

        return Inertia::render('Delivery/Transfers/index', [
            'transfers' => $shown->map(fn (Transfer $t) => $this->workflow->present($t))->values()->all(),
            'tab' => $tab,
            'counts' => ['mine' => $mine->count(), 'available' => $pool->count()],
        ]);
    }

    public function claim(Transfer $transfer): RedirectResponse
    {
        if (! $this->workflow->assignCourier($transfer, Auth::user())) {
            return back()->with('error', 'Someone else is already carrying that transfer.');
        }

        return back()->with('success', "You are carrying {$transfer->reference}. Collect it at the origin.");
    }

    public function handover(Transfer $transfer): RedirectResponse
    {
        if ((int) $transfer->courier_id !== (int) Auth::id()) {
            return back()->with('error', 'That transfer is not yours to hand over.');
        }

        if (! $this->workflow->markCompleted($transfer, Auth::user())) {
            return back()->with('error', 'Only a transfer you have collected can be handed over.');
        }

        return back()->with('success', "{$transfer->reference} handed over.");
    }
}
