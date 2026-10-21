<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Exceptions\ProductIdeaException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\PurchaseOrderReasonRequest;
use App\Models\Procurement\ConsignmentCost;
use App\Services\Procurement\ConsignmentPresenter;
use App\Services\Procurement\ConsignmentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Import costs (freight, customs, port fees…) waiting for their second
 * person. The same inbox on the admin app (global admins) and the finance
 * app; confirming also works from the consignment page in procurement.
 */
class ConsignmentCostInboxController extends Controller
{
    public function __construct(
        private readonly ConsignmentService $consignments,
        private readonly ConsignmentPresenter $presenter,
    ) {
    }

    public function index(Request $request): Response
    {
        $app = str_starts_with((string) $request->route()?->getName(), 'finance.') ? 'finance' : 'admin';
        $user = $request->user();

        $waiting = ConsignmentCost::query()->whereNull('confirmed_at')->whereNull('rejected_at')
            ->with(['consignment', 'recorder'])->orderBy('id')->get();
        $recent = ConsignmentCost::query()->where(fn ($q) => $q->whereNotNull('confirmed_at')->orWhereNotNull('rejected_at'))
            ->with(['consignment', 'recorder'])->latest('updated_at')->limit(15)->get();

        return Inertia::render($app === 'finance' ? 'Finance/ImportCosts/Index' : 'Admin/ImportCosts/Index', [
            'waiting' => $waiting->map(fn (ConsignmentCost $c): array => $this->presenter->pendingCost($c, $user))->values()->all(),
            'recent' => $recent->map(fn (ConsignmentCost $c): array => $this->presenter->pendingCost($c, $user))->values()->all(),
            'routePrefix' => "{$app}.import_costs",
        ]);
    }

    public function confirm(Request $request, ConsignmentCost $cost): RedirectResponse
    {
        try {
            $this->consignments->confirm($cost, $request->user());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Cost confirmed: it now counts in the goods\' cost.');
    }

    public function reject(PurchaseOrderReasonRequest $request, ConsignmentCost $cost): RedirectResponse
    {
        try {
            $this->consignments->reject($cost, $request->user(), (string) $request->validated('reason'));
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Cost rejected: it does not count.');
    }
}
