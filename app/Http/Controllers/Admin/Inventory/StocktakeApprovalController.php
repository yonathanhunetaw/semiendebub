<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Exceptions\InsufficientStockException;
use App\Http\Controllers\Controller;
use App\Models\Inventory\Stocktake;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StocktakeService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * Counts waiting for a second person, for admins and store managers.
 *
 * A stocktake is approved by someone other than the keeper who submitted it. A store
 * with one keeper had nobody to do that: managers cannot open the stock keeper app and
 * admins are sent home from it. Here they see their store's submitted counts (a global
 * admin on "All stores" also sees the hubs') and approve them; StocktakeService books
 * the differences exactly as the keeper's own Approve does.
 */
class StocktakeApprovalController extends Controller
{
    public function __construct(private readonly StocktakeService $stocktakes)
    {
    }

    public function index(Request $request, ActiveStore $activeStore): Response
    {
        $counts = Stocktake::query()
            ->where('status', Stocktake::SUBMITTED)
            ->when($activeStore->scopeIds() !== null, fn ($query) => $activeStore->applyThrough($query, 'location'))
            ->oldest('submitted_at')
            ->get()
            ->map(fn (Stocktake $take): array => $this->stocktakes->present($take, $request->user()))
            ->values();

        return Inertia::render('Admin/Inventory/Counts/Index', ['counts' => $counts]);
    }

    public function approve(Request $request, ActiveStore $activeStore, Stocktake $stocktake): RedirectResponse
    {
        $stocktake->loadMissing('location');
        $storeId = $stocktake->location?->store_id;

        // Another store's count, or a hub's for anyone but a global admin, is a 404.
        abort_unless($activeStore->allows($storeId === null ? null : (int) $storeId), 404);

        try {
            $this->stocktakes->post($stocktake, $request->user());
        } catch (InvalidArgumentException|InsufficientStockException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "{$stocktake->reference} approved and its differences booked.");
    }
}
