<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Inventory\ReceiptDiscrepancy;
use App\Models\Inventory\StockLocation;
use App\Models\Procurement\Consignment;
use App\Models\Procurement\ConsignmentLine;
use App\Services\Inventory\ReceivingService;
use App\Services\Inventory\StockKeeperVisibility;
use App\Services\Procurement\ConsignmentPresenter;
use App\Services\Procurement\ConsignmentReceiving;

/** The Receiving desk and the Arrivals desk (stock keeper app). */
class ReceivingStations
{
    use BuildsStations;

    public function __construct(
        private readonly ReceivingService $receiving,
        private readonly ConsignmentReceiving $consignments,
    ) {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        return $app === 'stock_keeper' ? [$this->receivingDesk($viewer), $this->arrivals($viewer)] : [];
    }

    /** Shortfalls, damage and over-deliveries to settle (Receiving page). */
    private function receivingDesk(User $viewer): array
    {
        $scope = app(StockKeeperVisibility::class)->scopeFor($viewer)['nodes'] ?? null;

        $rows = ReceiptDiscrepancy::query()
            ->where('status', ReceiptDiscrepancy::OPEN)
            ->when($scope !== null, fn ($q) => $q->whereIn('stock_location_id', array_map('intval', $scope)))
            ->with(['itemVariant.item', 'location', 'courier', 'recorder', 'receivable'])
            ->latest()
            ->limit(20)
            ->get();

        $items = $rows->map(function (ReceiptDiscrepancy $r) use ($viewer): array {
            $can = $this->receiving->canResolve($viewer, $r);
            $note = ['name' => 'note', 'label' => 'Note (optional)', 'type' => 'text'];

            return [
                'id' => (string) $r->id,
                'title' => ($r->itemVariant?->item?->product_name ?? 'Unknown item').' · '.strtoupper((string) $r->kind),
                'subtitle' => $r->reference.' · '.($r->location?->name ?? ''),
                'lines' => array_values(array_filter([
                    'Expected '.(int) $r->expected.', received '.(int) $r->received.($r->courier ? ' · courier '.$this->person($r->courier) : ''),
                    $r->recorder && ! $can && (int) $r->recorded_by === (int) $viewer->id ? 'You recorded this: someone else settles it.' : null,
                ])),
                'chips' => [['label' => (string) $r->kind, 'tone' => $r->kind === ReceiptDiscrepancy::OVER ? 'info' : 'warning']],
                'actions' => $can ? array_values(array_filter([
                    $this->act('found', 'Found it', 'stock_keeper.receiving.resolve', ['discrepancy' => $r->id], 'post', ['resolution' => 'found'], [$note], 'success'),
                    $this->act('lost', 'It is lost', 'stock_keeper.receiving.resolve', ['discrepancy' => $r->id], 'post', ['resolution' => 'lost'], [$note], 'warning'),
                    $this->act('accepted', 'Accept it', 'stock_keeper.receiving.resolve', ['discrepancy' => $r->id], 'post', ['resolution' => 'accepted'], [$note], 'inherit'),
                ])) : [],
            ];
        })->all();

        return $this->station('receiving', 'Receiving', 'desk_receiving', $items, [
            'blurb' => 'What arrived short, damaged or over. Someone other than whoever counted it settles each.',
            'empty' => 'Nothing to settle: every count matched.',
            'open' => $this->open('Open Receiving', 'stock_keeper.receiving.index'),
        ]);
    }

    /** Goods we bought, on their way in, for the Main Hub's keepers to count in (Arrivals page). */
    private function arrivals(User $viewer): array
    {
        $hubs = StockLocation::query()->where('kind', StockLocation::KIND_MAIN_HUB)->orderBy('name')->get()
            ->filter(fn (StockLocation $hub): bool => $this->consignments->mayReceive($viewer, $hub))->values();

        $rows = Consignment::query()
            ->whereIn('stage', Consignment::IN_TRANSIT)
            ->with(['lines.variant.item', 'lines.variant.itemPackagingType'])
            ->orderByRaw('eta IS NULL')->orderBy('eta')
            ->limit(15)
            ->get();

        $items = $rows->map(function (Consignment $c) use ($hubs): array {
            $fields = [];

            if ($hubs->count() > 1) {
                $fields[] = ['name' => 'hub_id', 'label' => 'Received at', 'type' => 'select', 'required' => true,
                    'options' => $hubs->map(fn (StockLocation $h): array => ['value' => (string) $h->id, 'label' => (string) $h->name])->all(), 'default' => (string) $hubs->first()?->id];
            }

            foreach ($c->lines->sortBy('id') as $line) {
                /** @var ConsignmentLine $line */
                $name = (string) ($line->variant?->item?->product_name ?? 'Item');
                $fields[] = ['name' => "counts.{$line->id}.received", 'label' => "{$name}: got (of {$line->quantity})", 'type' => 'number', 'default' => (int) $line->quantity, 'min' => 0, 'required' => true];
                $fields[] = ['name' => "counts.{$line->id}.damaged", 'label' => "{$name}: damaged", 'type' => 'number', 'default' => 0, 'min' => 0];
            }

            return [
                'id' => (string) $c->id,
                'title' => (string) $c->reference,
                'subtitle' => ($c->container_number ? $c->container_number.' · ' : '').($c->eta ? 'ETA '.$c->eta->toDateString() : 'no ETA'),
                'lines' => $c->lines->sortBy('id')->map(fn (ConsignmentLine $l): string => ($l->variant?->item?->product_name ?? 'Item').' × '.(int) $l->quantity)->values()->all(),
                'chips' => [['label' => (string) (ConsignmentPresenter::STAGE_LABELS[$c->stage] ?? $c->stage), 'tone' => 'info']],
                'actions' => $hubs->isEmpty() ? [] : array_values(array_filter([
                    $this->act('receive', 'Count it in', 'stock_keeper.arrivals.receive', ['consignment' => $c->id], 'post', $hubs->count() === 1 ? ['hub_id' => $hubs->first()->id] : [], $fields, 'success'),
                ])),
            ];
        })->all();

        return $this->station('arrivals', 'Arrivals', 'desk_arrivals', $items, [
            'blurb' => 'Goods we bought, on their way to the Main Hub. Count them in: anything short or over goes to Receiving.',
            'empty' => 'No consignment is on its way in.',
            'open' => $this->open('Open Arrivals', 'stock_keeper.arrivals.index'),
        ]);
    }
}
