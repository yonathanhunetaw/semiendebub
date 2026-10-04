<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Http\Controllers\Controller;
use App\Http\Requests\Inventory\ShelveTransferRequest;
use App\Models\StockKeeper\Transfer;
use App\Services\Inventory\RefillBoard;
use App\Services\Inventory\StockPermissions;
use App\Services\TransferWorkflowService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The stock keeper's shelving list: floor → shelf transfers to carry across,
 * approved Remote Hub refills to accept, and bins at their refill line with
 * nothing on its way yet.
 */
class ShelvingController extends Controller
{
    public function __construct(private readonly RefillBoard $board)
    {
    }

    public function index(Request $request): Response
    {
        $user = $request->user();
        $storeId = $user?->store_id !== null ? (int) $user->store_id : null;

        if (in_array($user?->roleKey(), ['admin', 'dev'], true) && $request->filled('store')) {
            $storeId = $request->integer('store');
        }

        return Inertia::render('StockKeeper/Shelving/index', [
            'storeId' => $storeId,
            'board' => $storeId !== null ? $this->board->shelvingList($storeId, $user) : null,
        ]);
    }

    /** Carry a floor → shelf transfer across in one step: no courier, same site. */
    public function shelve(ShelveTransferRequest $request, Transfer $transfer, TransferWorkflowService $workflow): RedirectResponse
    {
        $user = $request->user();

        DB::transaction(function () use ($workflow, $transfer, $user): void {
            if ($transfer->status === TransferWorkflowService::STATUS_PENDING) {
                $workflow->markDispatched($transfer, $user);
            }

            $workflow->markCompleted($transfer->fresh(), $user);
        });

        return back()->with(
            $transfer->fresh()->status === TransferWorkflowService::STATUS_COMPLETED ? 'success' : 'error',
            $transfer->fresh()->status === TransferWorkflowService::STATUS_COMPLETED
                ? "{$transfer->reference} shelved."
                : "{$transfer->reference} could not be shelved.",
        );
    }

    /** Who may do what with shelves and refills, and who runs this store — read-only. */
    public function permissions(Request $request, StockPermissions $permissions): Response
    {
        $storeId = $request->user()?->store_id !== null ? (int) $request->user()->store_id : null;

        return Inertia::render('StockKeeper/Shelving/Permissions', [
            'abilities' => StockPermissions::catalogue(),
            'ticks' => StockPermissions::TICK_LABELS,
            'people' => $storeId !== null ? $permissions->peopleOf($storeId) : [],
        ]);
    }
}
