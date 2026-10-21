<?php

declare(strict_types=1);

namespace App\Http\Controllers\StockKeeper;

use App\Exceptions\ProductIdeaException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\ReceiveConsignmentRequest;
use App\Models\Inventory\StockLocation;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentLine;
use App\Services\Procurement\ConsignmentPresenter;
use App\Services\Procurement\ConsignmentReceiving;
use App\Services\Procurement\PurchaseOrderPresenter;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Arrivals: goods we bought, on their way in, for the Main Hub's stock
 * keepers to count in. Quantities only: what anything cost is for
 * procurement and admins.
 */
class ArrivalController extends Controller
{
    public function __construct(private readonly ConsignmentReceiving $receiving)
    {
    }

    public function index(Request $request): Response
    {
        $user = $request->user();
        $hubs = StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->orderBy('name')->get()
            ->filter(fn (StockLocation $hub): bool => $this->receiving->mayReceive($user, $hub))->values();

        $consignments = Consignment::query()
            ->whereIn('stage', Consignment::IN_TRANSIT)
            ->with(['lines.variant.item', 'lines.variant.itemColor', 'lines.variant.itemSize', 'lines.variant.itemPackagingType', 'route'])
            ->orderByRaw('eta IS NULL')->orderBy('eta')
            ->get();

        return Inertia::render('StockKeeper/Arrivals/Index', [
            'consignments' => $consignments->map(fn (Consignment $c): array => [
                'id' => (int) $c->id,
                'reference' => (string) $c->reference,
                'stage' => (string) $c->stage,
                'stage_label' => ConsignmentPresenter::STAGE_LABELS[$c->stage] ?? $c->stage,
                'container_number' => $c->container_number,
                'eta' => $c->eta?->toDateString(),
                'lines' => $c->lines->sortBy('id')->values()->map(fn (ConsignmentLine $l): array => [
                    'id' => (int) $l->id,
                    'variant' => $l->variant ? PurchaseOrderPresenter::variant($l->variant) : null,
                    'quantity' => (int) $l->quantity,
                ])->all(),
            ])->values()->all(),
            'hubs' => $hubs->map(fn (StockLocation $h): array => ['id' => (int) $h->id, 'name' => (string) $h->name])->all(),
        ]);
    }

    public function receive(ReceiveConsignmentRequest $request, Consignment $consignment): RedirectResponse
    {
        $hub = StockLocation::query()->findOrFail((int) $request->validated('hub_id'));

        try {
            $this->receiving->receive($consignment, $request->user(), $hub, $request->validated('counts') ?? []);
        } catch (ProductIdeaException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', "Consignment {$consignment->reference} received at {$hub->name}. Anything short or over is under Receiving.");
    }
}
