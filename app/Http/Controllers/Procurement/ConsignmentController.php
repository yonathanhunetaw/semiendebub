<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Exceptions\ProductIdeaException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\AddConsignmentLineRequest;
use App\Http\Requests\Procurement\AdvanceConsignmentRequest;
use App\Http\Requests\Procurement\RecordConsignmentCostRequest;
use App\Http\Requests\Procurement\SaveConsignmentRequest;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentCost;
use App\Models\Procurement\ConsignmentLine;
use App\Models\Procurement\ExchangeRate;
use App\Models\Procurement\FreightRoute;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\PurchaseLine;
use App\Services\Procurement\ConsignmentPresenter;
use App\Services\Procurement\ConsignmentService;
use App\Services\Procurement\PurchaseOrderPresenter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Consignments: goods we bought on their way in, stage by stage, and what
 * each stage cost. The rules are ConsignmentService's.
 */
class ConsignmentController extends Controller
{
    public function __construct(
        private readonly ConsignmentService $consignments,
        private readonly ConsignmentPresenter $presenter,
    ) {
    }

    public function index(Request $request): Response
    {
        $tab = $request->string('tab')->toString() === 'done' ? 'done' : 'open';
        $done = [Consignment::RECEIVED, Consignment::CANCELLED];

        $rows = Consignment::query()
            ->when($tab === 'open', fn ($q) => $q->whereNotIn('stage', $done), fn ($q) => $q->whereIn('stage', $done))
            ->with(['lines', 'costs', 'route'])
            ->latest('id')
            ->limit(100)
            ->get();

        return Inertia::render('Procurement/Consignments/Index', [
            'consignments' => $rows->map(fn (Consignment $c): array => $this->presenter->summary($c))->values()->all(),
            'tab' => $tab,
            'routes' => $this->routes(),
            'canManage' => $this->consignments->mayManage($request->user()),
        ]);
    }

    public function store(SaveConsignmentRequest $request): RedirectResponse
    {
        try {
            $consignment = $this->consignments->create($request->user(), $request->validated());
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return redirect()->route('procurement.consignments.show', $consignment)->with('success', "Consignment {$consignment->reference} started. Put the goods on it.");
    }

    public function show(Request $request, Consignment $consignment): Response
    {
        $available = [];

        if ($consignment->stage === Consignment::FORMING) {
            $lines = PurchaseLine::query()
                ->whereHas('purchase', fn ($q) => $q->whereIn('status', [Purchase::STATUS_ORDERED, Purchase::STATUS_PARTIALLY_RECEIVED]))
                ->with(['purchase.supplier', 'variant.item', 'variant.itemColor', 'variant.itemSize', 'variant.itemPackagingType'])
                ->get();
            $left = $this->consignments->remaining($lines);

            $available = $lines->filter(fn (PurchaseLine $l): bool => $left[$l->id] > 0)->map(fn (PurchaseLine $l): array => [
                'id' => (int) $l->id,
                'purchase' => ['id' => (int) $l->purchase_id, 'reference' => (string) $l->purchase->reference_number, 'supplier' => $l->purchase->supplier?->name],
                'variant' => $l->variant ? PurchaseOrderPresenter::variant($l->variant) : null,
                'remaining' => $left[$l->id],
                'quantity' => (int) $l->quantity,
            ])->values()->all();
        }

        return Inertia::render('Procurement/Consignments/Show', [
            'consignment' => $this->presenter->detail($consignment, $request->user()),
            'available' => $available,
            'routes' => $this->routes(),
            'kinds' => collect(ConsignmentCost::KINDS)->map(fn (array $k, string $key): array => ['key' => $key, 'label' => $k[0], 'allocation' => $k[1], 'recoverable' => $k[2]])->values()->all(),
            'currencies' => config('procurement.currencies', []),
            'rates' => collect(config('procurement.currencies', []))->mapWithKeys(fn (string $c): array => [$c => ExchangeRate::latestFor($c)])->all(),
        ]);
    }

    public function update(SaveConsignmentRequest $request, Consignment $consignment): RedirectResponse
    {
        return $this->attempt(fn () => $this->consignments->update($consignment, $request->user(), $request->validated()), 'Saved.');
    }

    public function addLine(AddConsignmentLineRequest $request, Consignment $consignment): RedirectResponse
    {
        return $this->attempt(fn () => $this->consignments->addLine(
            $consignment,
            $request->user(),
            (int) $request->validated('purchase_line_id'),
            (int) $request->validated('quantity'),
            $request->validated('cbm') !== null ? (float) $request->validated('cbm') : null,
            $request->validated('weight_kg') !== null ? (float) $request->validated('weight_kg') : null,
        ), 'Put on the consignment.');
    }

    public function removeLine(Request $request, ConsignmentLine $line): RedirectResponse
    {
        return $this->attempt(fn () => $this->consignments->removeLine($line, $request->user()), 'Taken off.');
    }

    public function advance(AdvanceConsignmentRequest $request, Consignment $consignment): RedirectResponse
    {
        return $this->attempt(fn () => $this->consignments->advance($consignment, $request->user(), (string) $request->validated('to')), 'Moved on: the stock moved with it.');
    }

    public function cancel(Request $request, Consignment $consignment): RedirectResponse
    {
        return $this->attempt(fn () => $this->consignments->cancel($consignment, $request->user()), 'Consignment cancelled.');
    }

    public function finalise(Request $request, Consignment $consignment, \App\Services\Procurement\ConsignmentReceiving $receiving): RedirectResponse
    {
        return $this->attempt(fn () => $receiving->finaliseCosts($consignment, $request->user()), 'Costs finalised: each item\'s cost is written.');
    }

    public function recordCost(RecordConsignmentCostRequest $request, Consignment $consignment): RedirectResponse
    {
        return $this->attempt(fn () => $this->consignments->recordCost($consignment, $request->user(), $request->validated()), 'Cost recorded. Finance or a global admin confirms it.');
    }

    public function deleteCost(Request $request, ConsignmentCost $cost): RedirectResponse
    {
        return $this->attempt(fn () => $this->consignments->deleteCost($cost, $request->user()), 'Cost taken back.');
    }

    private function attempt(callable $action, string $success): RedirectResponse
    {
        try {
            $action();
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', $success);
    }

    /** @return array<int, array{id: int, name: string}> */
    private function routes(): array
    {
        return FreightRoute::query()->where('is_active', true)->orderBy('name')->get(['id', 'name'])
            ->map(fn (FreightRoute $r): array => ['id' => (int) $r->id, 'name' => (string) $r->name])->all();
    }
}
