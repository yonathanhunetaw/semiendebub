<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\ApproveReplenishmentRequest;
use App\Http\Requests\Inventory\RejectReplenishmentRequest;
use App\Models\StockKeeper\Transfer;
use App\Services\Inventory\ReplenishmentProposalService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The store manager's queue of automated replenishment proposals.
 *
 * Everything the planner raises lands here and nowhere else — it is deliberately
 * not on the active transfers board, because an unapproved suggestion is not
 * work. Approving one admits it to that board; rejecting one cancels it with a
 * reason, so the next sweep's identical suggestion can be read in context.
 */
class ReplenishmentController extends Controller
{
    public function __construct(private readonly ReplenishmentProposalService $planner)
    {
    }

    public function index(Request $request): Response
    {
        $user = $request->user();

        // A manager sees their own store's queue; an admin sees the network.
        $storeId = $user !== null && ! $user->isRole('admin') && $user->store_id !== null
            ? (int) $user->store_id
            : ($request->integer('store_id') ?: null);

        $proposals = $this->planner->pendingProposals($storeId);

        return Inertia::render('Admin/Inventory/Transfers/Proposals', [
            'proposals' => $proposals,
            'filters' => ['store_id' => $storeId],
            'can_approve' => $user?->canApproveReplenishment() ?? false,
            'counts' => [
                'awaiting_approval' => count($proposals),
                'approved_today' => Transfer::query()
                    ->autoProposed()
                    ->where('approval_state', Transfer::APPROVAL_APPROVED)
                    ->whereDate('approved_at', now()->toDateString())
                    ->count(),
                'rejected_today' => Transfer::query()
                    ->autoProposed()
                    ->where('approval_state', Transfer::APPROVAL_REJECTED)
                    ->whereDate('rejected_at', now()->toDateString())
                    ->count(),
            ],
            // Breaches the Transfer domain cannot express: warehouse to
            // warehouse is freight, and belongs to the Shipment builder.
            'shipment_candidates' => $this->shipmentCandidates(),
        ]);
    }

    public function approve(ApproveReplenishmentRequest $request, Transfer $transfer): RedirectResponse
    {
        $approved = $this->planner->approve(
            $transfer,
            $request->user(),
            $request->approvedQuantity(),
        );

        if (! $approved) {
            return back()->with('error', 'That proposal has already been ruled on.');
        }

        return back()->with(
            'success',
            "Transfer {$transfer->reference} approved and added to the active transfer list.",
        );
    }

    public function reject(RejectReplenishmentRequest $request, Transfer $transfer): RedirectResponse
    {
        $rejected = $this->planner->reject(
            $transfer,
            $request->user(),
            (string) $request->validated('reason'),
        );

        if (! $rejected) {
            return back()->with('error', 'That proposal has already been ruled on.');
        }

        return back()->with('success', "Proposal {$transfer->reference} rejected.");
    }

    /**
     * Shortfalls that need a Shipment rather than a Transfer.
     *
     * Recomputed on each load rather than stored: there is no record to keep —
     * no Transfer was written for them, precisely because writing one would put
     * freight in the wrong domain. Read-only, so opening the screen cannot
     * create anything.
     *
     * @return array<int, array<string, mixed>>
     */
    private function shipmentCandidates(): array
    {
        return array_map(fn (array $candidate): array => [
            'sku' => $candidate['capacity']->itemVariant?->sku,
            'product_name' => $candidate['capacity']->itemVariant?->item?->product_name,
            'shortfall' => (int) $candidate['shortfall'],
            'on_hand' => (int) $candidate['on_hand'],
            'source' => $candidate['source']['label'] . ' · ' . $candidate['source']['name'],
            'destination' => $candidate['destination']['label'] . ' · ' . $candidate['destination']['name'],
            'reason' => (string) ($candidate['reason'] ?? ''),
        ], $this->planner->shipmentCandidates());
    }
}
