<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Requests\StockKeeper\StoreTransferRequest;
use App\Models\StockKeeper\Transfer;
use App\Services\StockKeeperService;
use App\Services\TransferWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Stock movements between locations, from the warehouse desk's side.
 *
 * Admin owns replenishment planning; this screen is the floor-level view —
 * raise a transfer, dispatch it, confirm it landed.
 */
class TransferController extends Controller
{
    public function __construct(
        private readonly StockKeeperService $stock,
        private readonly TransferWorkflowService $workflow,
    ) {
    }

    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString() ?: null;

        /*
         * Proposals are excluded from the floor's board.
         *
         * The capacity planner raises replenishment transfers at
         * `status = pending`, which is the same status the floor dispatches
         * from — so without this scope an unapproved suggestion would appear as
         * work to action. They live on the store manager's approvals screen
         * until they are approved, at which point they appear here.
         */
        $query = Transfer::query()
            ->active()
            ->with(['itemVariant.item', 'fromStore', 'toStore', 'initiator']);

        if ($status !== null && $status !== 'all') {
            $query->where('status', $status);
        }

        $paginator = $query->orderByDesc('id')->paginate(25)->withQueryString();

        return Inertia::render('StockKeeper/Transfers/index', [
            'transfers' => collect($paginator->items())
                ->map(fn (Transfer $transfer) => $this->workflow->present($transfer))
                ->values()
                ->all(),
            'filters' => ['status' => $status ?? 'all'],
            'counts' => $this->workflow->statusCounts(),
            'stores' => collect($this->stock->locations())
                ->where('kind', 'store')
                ->values()
                ->all(),
            // Every shelf, floor and hub in the location tree.
            'locations' => $this->stock->locations(),
            'variants' => $this->stock->variantOptions()->all(),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function store(StoreTransferRequest $request): RedirectResponse
    {
        try {
            $this->workflow->create(
                variantId: (int) $request->validated('item_variant_id'),
                fromStoreId: $request->validated('from_store_id') !== null ? (int) $request->validated('from_store_id') : null,
                toStoreId: $request->validated('to_store_id') !== null ? (int) $request->validated('to_store_id') : null,
                quantity: (int) $request->validated('quantity'),
                initiatedBy: Auth::id(),
                notes: $request->validated('notes'),
                // Optional: a transfer may name a shelf or back room rather than
                // the store as a whole.
                sourceLocationType: $request->validated('source_location_type'),
                sourceLocationId: $request->validated('source_location_id') !== null
                    ? (int) $request->validated('source_location_id')
                    : null,
                destinationLocationType: $request->validated('destination_location_type'),
                destinationLocationId: $request->validated('destination_location_id') !== null
                    ? (int) $request->validated('destination_location_id')
                    : null,
                courierId: $request->validated('courier_id') !== null ? (int) $request->validated('courier_id') : null,
            );
        } catch (\App\Exceptions\MovementDomainException $exception) {
            // The form request checks this too; this catch is what keeps an API
            // caller from seeing a 500 instead of the rule.
            return back()->withErrors(['to_store_id' => $exception->getMessage()]);
        }

        return back()->with('success', 'Transfer raised and queued for dispatch.');
    }

    public function dispatchTransfer(Transfer $transfer): RedirectResponse
    {
        if ($transfer->awaitsApproval()) {
            return back()->with(
                'error',
                'This is an automated replenishment proposal. A store manager must approve it before it can be dispatched.',
            );
        }

        if (! $this->workflow->markDispatched($transfer, request()->user())) {
            return back()->with('error', 'Only a queued transfer can be dispatched.');
        }

        return back()->with('success', "Transfer {$transfer->reference} is in transit.");
    }

    public function complete(Transfer $transfer): RedirectResponse
    {
        if (! $this->workflow->markCompleted($transfer, request()->user())) {
            return back()->with('error', 'Only a transfer in transit can be completed.');
        }

        return back()->with('success', "Transfer {$transfer->reference} received and stock moved.");
    }

    public function cancel(Transfer $transfer): RedirectResponse
    {
        if (! $this->workflow->cancel($transfer, Auth::id())) {
            return back()->with('error', 'A completed transfer cannot be cancelled.');
        }

        return back()->with('success', "Transfer {$transfer->reference} cancelled.");
    }
}
