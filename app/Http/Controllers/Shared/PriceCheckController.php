<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Exceptions\ProductIdeaException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\OpenPriceCheckRequest;
use App\Http\Requests\Procurement\PurchaseOrderReasonRequest;
use App\Http\Requests\Procurement\RecordPriceObservationRequest;
use App\Models\Procurement\PriceCheck;
use App\Models\Procurement\PriceObservation;
use App\Services\Admin\ActiveStore;
use App\Services\Procurement\PriceCheckService;
use App\Services\Workforce\LocalTime;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Price checks: sellers write down what other shops charge, someone else
 * verifies each price. The same screens on the seller and admin apps, each
 * in its own layout. Who may do what is PriceCheckService's call.
 */
class PriceCheckController extends Controller
{
    private const LIST_LIMIT = 100;

    public function __construct(private readonly PriceCheckService $checks)
    {
    }

    public function index(Request $request): Response
    {
        $app = $this->app($request);
        $user = $request->user();
        $tab = $request->string('tab')->toString() === PriceCheck::CLOSED ? PriceCheck::CLOSED : PriceCheck::OPEN;

        $base = $this->checks->visibleTo(PriceCheck::query(), $user)
            ->when($app === 'admin' && app(ActiveStore::class)->id() !== null, fn (Builder $q) => $q->where('store_id', app(ActiveStore::class)->id()));

        $checks = (clone $base)->where('status', $tab)
            ->with(['store', 'idea', 'item', 'assignees', 'observations.shop', 'observations.recorder', 'observations.check'])
            ->orderByRaw('due_on IS NULL')->orderBy('due_on')->latest('id')
            ->limit(self::LIST_LIMIT)
            ->get();

        return Inertia::render($app === 'seller' ? 'Seller/PriceChecks/Index' : 'Admin/PriceChecks/Index', [
            'checks' => $checks->map(fn (PriceCheck $check): array => $this->checks->present($check, $user))->values()->all(),
            'tab' => $tab,
            'counts' => [
                PriceCheck::OPEN => (clone $base)->where('status', PriceCheck::OPEN)->count(),
                PriceCheck::CLOSED => (clone $base)->where('status', PriceCheck::CLOSED)->count(),
            ],
            'toVerify' => PriceObservation::query()
                ->whereNull('verified_at')->whereNull('rejected_at')
                ->whereIn('price_check_id', (clone $base)->select('id'))
                ->where('recorded_by', '!=', $user?->id)
                ->count(),
            'routePrefix' => "{$app}.price_checks",
            // For "check an item we sell" (admin app): the stores this admin runs and who can be named.
            'stores' => $app === 'admin' ? app(ActiveStore::class)->accessibleStores()
                ->map(fn ($s): array => ['id' => (int) $s->id, 'name' => (string) $s->name])->values()->all() : [],
            'staff' => $app === 'admin' ? (object) $this->checks->nameableStaff($user) : (object) [],
        ]);
    }

    public function show(Request $request, PriceCheck $check): Response
    {
        $app = $this->app($request);
        $this->authorizeSee($request, $check);

        return Inertia::render($app === 'seller' ? 'Seller/PriceChecks/Show' : 'Admin/PriceChecks/Show', [
            'check' => $this->checks->present($check, $request->user()),
            'routePrefix' => "{$app}.price_checks",
            // The shops' date, so the form never defaults to tomorrow or yesterday.
            'today' => LocalTime::dateOf(),
        ]);
    }

    /** A check on an item we already sell (admin app). Ideas open theirs when sent to price check. */
    public function store(OpenPriceCheckRequest $request): RedirectResponse
    {
        try {
            $check = $this->checks->open(
                by: $request->user(),
                storeId: (int) $request->validated('store_id'),
                itemId: (int) $request->validated('item_id'),
                shopsWanted: (int) ($request->validated('shops_wanted') ?? 3),
                dueOn: $request->validated('due_on'),
                assigneeIds: array_map('intval', $request->validated('assignee_ids') ?? []),
                note: $request->validated('note'),
            );
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()->route('admin.price_checks.show', $check)->with('success', 'Price check opened.');
    }

    public function record(RecordPriceObservationRequest $request, PriceCheck $check): RedirectResponse
    {
        $this->authorizeSee($request, $check);

        try {
            $this->checks->record($check, $request->user(), $request->validated());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Price written down. Someone else checks it next.');
    }

    public function verify(Request $request, PriceObservation $observation): RedirectResponse
    {
        $this->authorizeSee($request, $observation->check);

        try {
            $this->checks->verify($observation, $request->user());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Price verified: it now counts.');
    }

    public function reject(PurchaseOrderReasonRequest $request, PriceObservation $observation): RedirectResponse
    {
        $this->authorizeSee($request, $observation->check);

        try {
            $this->checks->reject($observation, $request->user(), (string) $request->validated('reason'));
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Price rejected: it does not count.');
    }

    public function close(Request $request, PriceCheck $check): RedirectResponse
    {
        $this->authorizeSee($request, $check);

        try {
            $this->checks->close($check, $request->user());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Price check closed.');
    }

    private function authorizeSee(Request $request, ?PriceCheck $check): void
    {
        abort_if($check === null || ! $this->checks->visibleTo(PriceCheck::query()->whereKey($check->id), $request->user())->exists(), 404);
    }

    private function app(Request $request): string
    {
        return str_starts_with((string) $request->route()?->getName(), 'seller.') ? 'seller' : 'admin';
    }
}
