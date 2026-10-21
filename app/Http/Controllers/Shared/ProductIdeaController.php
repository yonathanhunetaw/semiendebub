<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Exceptions\ProductIdeaException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\MarkIdeaBoughtRequest;
use App\Http\Requests\Procurement\MoveProductIdeaRequest;
use App\Http\Requests\Procurement\SuggestProductIdeaRequest;
use App\Models\Procurement\ProductIdea;
use App\Models\Store\Store;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StockPermissions;
use App\Services\Procurement\PriceCheckService;
use App\Services\Procurement\ProductIdeaService;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Product ideas: the same board on the seller, admin and procurement apps,
 * each rendering its own page so it sits in that app's layout. Who sees and
 * moves what is ProductIdeaService's call.
 */
class ProductIdeaController extends Controller
{
    private const LIST_LIMIT = 100;

    public function __construct(private readonly ProductIdeaService $ideas)
    {
    }

    public function index(Request $request): Response
    {
        $app = $this->app($request);
        $user = $request->user();
        $tab = $request->string('tab')->toString() ?: 'open';

        $base = $this->ideas->visibleTo(ProductIdea::query(), $user)
            // On the admin app the store dropdown narrows it: that store plus the ideas for every store.
            ->when($app === 'admin' && app(ActiveStore::class)->id() !== null, fn (Builder $q) => $q
                ->where(fn (Builder $w) => $w->whereNull('store_id')->orWhere('store_id', app(ActiveStore::class)->id())));

        $counts = (clone $base)->toBase()->selectRaw('status, count(*) as n')->groupBy('status')->pluck('n', 'status')
            ->map(fn ($n): int => (int) $n)->all();

        $ideas = (clone $base)
            ->when($tab === 'open', fn (Builder $q) => $q->whereIn('status', ProductIdea::OPEN))
            ->when(in_array($tab, ProductIdea::STATUSES, true), fn (Builder $q) => $q->where('status', $tab))
            ->with(['store', 'suggester', 'events.user', 'priceChecks.store', 'priceChecks.observations', 'priceChecks.assignees', 'quotes'])
            ->latest('id')
            ->limit(self::LIST_LIMIT)
            ->get();

        return Inertia::render($this->component($app), [
            'ideas' => $ideas->map(fn (ProductIdea $idea): array => $this->ideas->present($idea, $user))->values()->all(),
            'counts' => $counts,
            'tab' => $tab,
            'canSuggest' => $this->ideas->canSuggest($user),
            'stores' => $this->storeChoices($request),
            // Who can be named on a price check, per store (admin app only).
            'staff' => $app === 'admin' ? ((object) app(PriceCheckService::class)->nameableStaff($user)) : (object) [],
            'routePrefix' => "{$app}.ideas",
            'checkRoutePrefix' => $app === 'procurement' ? null : "{$app}.price_checks",
            // The quotes screen: procurement takes them, admins read them. Sellers have none.
            'quotesRoute' => $app === 'seller' ? null : "{$app}.ideas.quotes",
            // Order lines an approved idea can be marked bought on (procurement app).
            'orderLines' => $app === 'procurement' ? $this->orderLines() : [],
        ]);
    }

    public function store(SuggestProductIdeaRequest $request): RedirectResponse
    {
        try {
            $idea = $this->ideas->suggest($request->user(), $request->validated());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Thanks: \"{$idea->name}\" is suggested.");
    }

    public function move(MoveProductIdeaRequest $request, ProductIdea $idea): RedirectResponse
    {
        abort_unless($this->ideas->canSee($request->user(), $idea), 404);

        try {
            $idea = $this->ideas->move(
                $idea,
                (string) $request->validated('to'),
                $request->user(),
                $request->validated('note'),
                $request->validated('target_price'),
                $request->safe()->only(['store_id', 'shops_wanted', 'due_on', 'assignee_ids', 'check_note']),
            );
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "\"{$idea->name}\" is now {$idea->status}.");
    }

    public function bought(MarkIdeaBoughtRequest $request, ProductIdea $idea): RedirectResponse
    {
        try {
            $idea = $this->ideas->markBought($idea, $request->user(), (int) $request->validated('purchase_line_id'));
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "\"{$idea->name}\" is bought.");
    }

    /**
     * The stores this person may suggest for: none for a seller (always
     * their own), the ones they run for a store admin, every retail store
     * for a global admin, dev and procurement (who may also pick none: every store).
     *
     * @return array<int, array{id: int, name: string}>
     */
    private function storeChoices(Request $request): array
    {
        $user = $request->user();
        $role = $user?->roleKey();

        if ($user === null || in_array($role, ['seller', 'store_manager'], true)) {
            return [];
        }

        $ids = $role === 'admin' && ! app(StockPermissions::class)->isGlobalAdmin($user)
            ? (ActiveStore::accessibleIdsFor($user) ?? [])
            : null;

        return Store::query()
            ->when($ids !== null, fn ($q) => $q->whereKey($ids), fn ($q) => $q->retail())
            ->orderBy('name')
            ->get(['id', 'name'])
            ->map(fn (Store $store): array => ['id' => (int) $store->id, 'name' => (string) $store->name])
            ->values()
            ->all();
    }

    /** @return array<int, array{id: int, label: string}> */
    private function orderLines(): array
    {
        return \App\Models\Procurement\PurchaseLine::query()
            ->whereHas('purchase', fn ($q) => $q->whereNotIn('status', [\App\Models\Procurement\Purchase::STATUS_DRAFT, \App\Models\Procurement\Purchase::STATUS_CANCELLED]))
            ->with(['purchase:id,reference_number', 'variant.item'])
            ->latest('id')
            ->limit(300)
            ->get()
            ->map(fn ($line): array => [
                'id' => (int) $line->id,
                'label' => trim(($line->purchase?->reference_number ?? '').' · '.($line->variant?->item?->product_name ?? 'Unknown').' · '.$line->quantity),
            ])->all();
    }

    private function app(Request $request): string
    {
        $name = (string) $request->route()?->getName();

        return match (true) {
            str_starts_with($name, 'seller.') => 'seller',
            str_starts_with($name, 'procurement.') => 'procurement',
            default => 'admin',
        };
    }

    private function component(string $app): string
    {
        return match ($app) {
            'seller' => 'Seller/Ideas/Index',
            'procurement' => 'Procurement/Ideas/Index',
            default => 'Admin/Ideas/Index',
        };
    }
}
