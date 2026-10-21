<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Exceptions\ProductIdeaException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\SaveSupplierQuoteRequest;
use App\Models\Procurement\ExchangeRate;
use App\Models\Procurement\FreightRoute;
use App\Models\Procurement\ProductIdea;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\SupplierQuote;
use App\Services\Procurement\ProductIdeaService;
use App\Services\Procurement\SupplierQuoteService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * An idea's supplier quotes and what each would cost on the shelf. Procurement
 * takes them in its app; the admin app shows the same screen read-only, for
 * the global admin who approves the idea. Sellers never see costs.
 */
class SupplierQuoteController extends Controller
{
    public function __construct(
        private readonly SupplierQuoteService $quotes,
        private readonly ProductIdeaService $ideas,
    ) {
    }

    public function show(Request $request, ProductIdea $idea): Response
    {
        $user = $request->user();
        abort_unless($this->ideas->canSee($user, $idea), 404);
        abort_unless($this->quotes->maySeeCosts($user, $idea), 403, 'Costs are for procurement and admins.');

        $app = str_starts_with((string) $request->route()?->getName(), 'procurement.') ? 'procurement' : 'admin';
        $canQuote = $app === 'procurement' && $this->quotes->mayQuote($user, $idea);

        return Inertia::render($app === 'procurement' ? 'Procurement/Ideas/Quotes' : 'Admin/Ideas/Quotes', [
            'idea' => $this->ideas->present($idea, $user),
            'board' => $this->quotes->board($idea),
            'canQuote' => $canQuote,
            'ideasRoute' => "{$app}.ideas.index",
            'suppliers' => $canQuote ? Supplier::query()->active()->orderBy('name')->get(['id', 'name', 'currency'])
                ->map(fn (Supplier $s): array => ['id' => (int) $s->id, 'name' => (string) $s->name, 'currency' => (string) $s->currency])->all() : [],
            'routes' => $canQuote ? FreightRoute::query()->where('is_active', true)->orderBy('name')->get()
                ->map(fn (FreightRoute $r): array => ['id' => (int) $r->id, 'name' => (string) $r->name, 'currency' => (string) $r->currency]
                    + array_combine(FreightRoute::FIGURES, array_map(fn (string $k): float => (float) $r->{$k}, FreightRoute::FIGURES)))->all() : [],
            'currencies' => config('procurement.currencies', []),
            'rates' => collect(config('procurement.currencies', []))->mapWithKeys(fn (string $c): array => [$c => ExchangeRate::latestFor($c)])->all(),
        ]);
    }

    public function store(SaveSupplierQuoteRequest $request, ProductIdea $idea): RedirectResponse
    {
        abort_unless($this->ideas->canSee($request->user(), $idea), 404);

        try {
            $this->quotes->save($idea, $request->user(), $request->validated());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Quote saved, with its estimate.');
    }

    public function update(SaveSupplierQuoteRequest $request, SupplierQuote $quote): RedirectResponse
    {
        try {
            $this->quotes->save($quote->idea, $request->user(), $request->validated(), $quote);
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Quote saved, with its estimate.');
    }

    public function recalculate(Request $request, SupplierQuote $quote): RedirectResponse
    {
        try {
            $this->quotes->recalculate($quote, $request->user());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Recalculated with today\'s rates, route and tariff.');
    }

    public function destroy(Request $request, SupplierQuote $quote): RedirectResponse
    {
        try {
            $this->quotes->delete($quote, $request->user());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Quote removed.');
    }
}
