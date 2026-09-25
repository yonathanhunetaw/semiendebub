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

        $query = Transfer::query()
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
        $this->workflow->create(
            variantId: (int) $request->validated('item_variant_id'),
            fromStoreId: (int) $request->validated('from_store_id'),
            toStoreId: (int) $request->validated('to_store_id'),
            quantity: (int) $request->validated('quantity'),
            initiatedBy: Auth::id(),
            notes: $request->validated('notes'),
        );

        return back()->with('success', 'Transfer raised and queued for dispatch.');
    }

    public function dispatchTransfer(Transfer $transfer): RedirectResponse
    {
        if (! $this->workflow->markDispatched($transfer)) {
            return back()->with('error', 'Only a queued transfer can be dispatched.');
        }

        return back()->with('success', "Transfer {$transfer->reference} is in transit.");
    }

    public function complete(Transfer $transfer): RedirectResponse
    {
        if (! $this->workflow->markCompleted($transfer)) {
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
