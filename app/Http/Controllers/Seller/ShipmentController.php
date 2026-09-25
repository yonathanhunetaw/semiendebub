<?php

declare(strict_types=1);

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Concerns\DrivesShipments;
use App\Http\Controllers\Controller;
use App\Http\Requests\Shipment\StoreShipmentItemRequest;
use App\Http\Requests\Shipment\StoreShipmentRequest;
use App\Http\Requests\Shipment\TransitionShipmentRequest;
use App\Models\Fulfillment\Shipment;
use App\Models\Item\ItemVariant;
use App\Models\Store\Store;
use App\Services\ShipmentWorkflowService;
use App\Services\StockKeeperService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The seller's view of shipments touching their store.
 *
 * They raise replenishment requests inbound to their store, watch runs on the
 * road, and confirm receipt when a load lands — the confirmation that moves
 * the stock onto their books.
 *
 * This controller previously served entirely hardcoded demo arrays; it now
 * reads the shared `shipments` tables.
 */
class ShipmentController extends Controller
{
<<<<<<< HEAD
    private function demoScheduledTransfers(): array
    {
        return [
            [
                'id'             => 1,
                'reference'      => 'RPL-2024-00871',
                'status'         => 'scheduled',
                'origin'         => ['name' => 'Central Hub', 'detail' => 'Kality Logistics Center'],
                'destination'    => ['name' => 'Main Store', 'detail' => 'Merkato Terminal 01'],
                'distance_km'    => 18.4,
                'scheduled_run'  => '2024-10-24T08:30', // Editable format
                'cutoff_label'   => 'Cutoff in 4h 15m',
                'sku_count'      => 3,
                'total_cartons'  => 150,
                'total_cbm'      => 8.7,
                'vehicle_max_cbm'=> 14.5,
                'load_percentage'=> 60,
                'vehicle_name'   => 'Isuzu NPR Box Truck',
                'vehicle_plate'  => 'ET-3-9482',
                'slot'           => 'BAY #04',
                'created_by'     => 'Admin',
                'created_at'     => 'Today • 06:14 AM',
                'schedule_options' => [
                    '10/25/2024, 08:30 AM',
                    '10/25/2024, 05:00 PM',
                    '10/26/2024, 08:30 AM',
                    '10/26/2024, 05:00 PM',
                ],
                'agreements'     => [
                    'creator' => [
                        'title'        => '1. Creator',
                        'role'         => 'Seller',
                        'party'        => 'Admin • Today • 06:14 AM',
                        'status'       => 'pending',
                        'status_label' => 'Pending Dispatch',
                        'detail'       => 'Manifest drafted by Admin. Ticked as Created once reviewed & dispatched.',
                    ],
                    'fleet' => [
                        'title'        => '2. Fleet',
                        'role'         => 'Carrier',
                        'party'        => 'Isuzu NPR Box Truck • ET-3-9482',
                        'status'       => 'accepted',
                        'status_label' => 'Driver Accepted',
                        'detail'       => 'Driver Abebe K. accepted assignment. Agreed to 10/25/2024, 08:30 AM slot.',
                    ],
                    'origin' => [
                        'title'        => '3. Origin',
                        'role'         => 'Depot',
                        'party'        => 'Central Hub (Kality Logistics Center)',
                        'status'       => 'pending',
                        'status_label' => 'Pending Stock Keeper',
                        'detail'       => 'Stock Keeper Dawit T. assigned. Bay #04 staging in progress.',
                    ],
                    'destination' => [
                        'title'        => '4. Dest.',
                        'role'         => 'Store & Remote WH',
                        'party'        => 'Main Store + Remote Warehouse',
                        'status'       => 'pending',
                        'status_label' => 'Pending 2 Stock Keepers',
                        'detail'       => 'Store Stock Keeper Helen M. & Remote WH Stock Keeper Blen A. both required.',
                        'stock_keepers' => [
                            [
                                'name'         => 'Main Store (Floor)',
                                'location'     => 'Merkato Terminal 01',
                                'role'         => 'Store Stock Keeper',
                                'keeper'       => 'Helen M.',
                                'status'       => 'pending',
                                'status_label' => 'Pending Stock Keeper',
                                'detail'       => 'Awaiting physical floor staging clearance.',
                            ],
                            [
                                'name'         => 'Remote Warehouse (Overflow)',
                                'location'     => 'Kality Sector 3 Depot',
                                'role'         => 'Remote WH Stock Keeper',
                                'keeper'       => 'Blen A.',
                                'status'       => 'pending',
                                'status_label' => 'Pending Stock Keeper',
                                'detail'       => 'Awaiting pallet bay reservation sign-off.',
                            ],
                        ],
                    ],
                ],
            ],
            [
                'id'             => 2,
                'reference'      => 'RPL-2024-00872',
                'status'         => 'dispatched',
                'origin'         => ['name' => 'Central Hub', 'detail' => 'Kality Logistics Center'],
                'destination'    => ['name' => 'Branch Store', 'detail' => 'Piazza Terminal 02'],
                'distance_km'    => 9.1,
                'scheduled_run'  => '2024-10-25T10:00',
                'cutoff_label'   => 'Cutoff in 26h',
                'sku_count'      => 5,
                'total_cartons'  => 80,
                'total_cbm'      => 4.2,
                'vehicle_max_cbm'=> 5.6,
                'load_percentage'=> 75,
                'vehicle_name'   => 'Suzuki Carry Mini Van',
                'vehicle_plate'  => 'ET-2-1104',
                'slot'           => 'BAY #02',
                'created_by'     => 'Admin',
                'created_at'     => 'Today • 05:40 AM',
                'schedule_options' => [
                    '10/25/2024, 08:30 AM',
                    '10/25/2024, 05:00 PM',
                    '10/26/2024, 08:30 AM',
                    '10/26/2024, 05:00 PM',
                ],
                'agreements'     => [
                    'creator' => [
                        'title'        => '1. Creator',
                        'role'         => 'Seller',
                        'party'        => 'Admin • Today • 05:40 AM',
                        'status'       => 'created',
                        'status_label' => 'Created',
                        'detail'       => 'Manifest reviewed, signed and dispatched by Admin.',
                    ],
                    'fleet' => [
                        'title'        => '2. Fleet',
                        'role'         => 'Carrier',
                        'party'        => 'Suzuki Carry Mini Van • ET-2-1104',
                        'status'       => 'rescheduled',
                        'status_label' => 'Rescheduled',
                        'detail'       => 'Driver Chala M. sent a reschedule request to 10/25/2024, 05:00 PM.',
                    ],
                    'origin' => [
                        'title'        => '3. Origin',
                        'role'         => 'Depot',
                        'party'        => 'Central Hub (Kality Logistics Center)',
                        'status'       => 'accepted',
                        'status_label' => 'Accepted',
                        'detail'       => 'Stock Keeper Dawit T. accepted and packed 80 cartons.',
                    ],
                    'destination' => [
                        'title'        => '4. Dest.',
                        'role'         => 'Store',
                        'party'        => 'Branch Store (Piazza Terminal 02)',
                        'status'       => 'rescheduled',
                        'status_label' => 'Rescheduled',
                        'detail'       => 'Store Stock Keeper Blen A. sent a reschedule request (+30 mins for shift swap).',
                    ],
                ],
            ],
            [
                'id'             => 3,
                'reference'      => 'RPL-2024-00873',
                'status'         => 'overdue',
                'origin'         => ['name' => 'Central Hub', 'detail' => 'Kality Logistics Center'],
                'destination'    => ['name' => 'Bole Store', 'detail' => 'Bole Terminal 03'],
                'distance_km'    => 22.7,
                'scheduled_run'  => '2024-10-23T07:00',
                'cutoff_label'   => 'OVERDUE by 2h',
                'sku_count'      => 2,
                'total_cartons'  => 40,
                'total_cbm'      => 2.8,
                'vehicle_max_cbm'=> 14.5,
                'load_percentage'=> 20,
                'vehicle_name'   => 'Isuzu NPR Box Truck',
                'vehicle_plate'  => 'ET-3-9482',
                'slot'           => 'BAY #01',
                'created_by'     => 'Admin',
                'created_at'     => 'Yesterday • 06:14 AM',
                'schedule_options' => [
                    '10/25/2024, 08:30 AM',
                    '10/25/2024, 05:00 PM',
                    '10/26/2024, 08:30 AM',
                    '10/26/2024, 05:00 PM',
                ],
                'agreements'     => [
                    'creator' => [
                        'title'        => '1. Creator',
                        'role'         => 'Seller',
                        'party'        => 'Admin • Yesterday • 06:14 AM',
                        'status'       => 'pending',
                        'status_label' => 'Pending Dispatch',
                        'detail'       => 'Emergency transfer created; pending review & dispatch authorization.',
                    ],
                    'fleet' => [
                        'title'        => '2. Fleet',
                        'role'         => 'Carrier',
                        'party'        => 'Isuzu NPR Box Truck • ET-3-9482',
                        'status'       => 'rescheduled',
                        'status_label' => 'Rescheduled',
                        'detail'       => 'Carrier dispatched replacement driver; slot reschedule requested.',
                    ],
                    'origin' => [
                        'title'        => '3. Origin',
                        'role'         => 'Depot',
                        'party'        => 'Central Hub (Kality Logistics Center)',
                        'status'       => 'rescheduled',
                        'status_label' => 'Rescheduled',
                        'detail'       => 'Stock Keeper Kidus W. sent a reschedule notice due to loading dock backlog.',
                    ],
                    'destination' => [
                        'title'        => '4. Dest.',
                        'role'         => 'Store',
                        'party'        => 'Bole Store (Bole Terminal 03)',
                        'status'       => 'pending',
                        'status_label' => 'Pending Stock Keeper',
                        'detail'       => 'Store Stock Keeper Samuel G. standing by for updated delivery window.',
                    ],
                ],
            ],
            [
                'id'             => 4,
                'reference'      => 'RPL-2024-00874',
                'status'         => 'en_route',
                'origin'         => ['name' => 'Central Hub', 'detail' => 'Kality Logistics Center'],
                'destination'    => ['name' => 'Bole Store', 'detail' => 'Bole Terminal 03'],
                'distance_km'    => 22.7,
                'scheduled_run'  => '2024-10-24T07:00',
                'cutoff_label'   => 'Departed 07:05 AM',
                'sku_count'      => 4,
                'total_cartons'  => 96,
                'total_cbm'      => 6.1,
                'vehicle_max_cbm'=> 14.5,
                'load_percentage'=> 42,
                'vehicle_name'   => 'Isuzu NPR Box Truck',
                'vehicle_plate'  => 'ET-3-9482',
                'slot'           => 'BAY #01',
                'created_by'     => 'Admin',
                'created_at'     => 'Today • 06:50 AM',
            ],
            [
                'id'             => 5,
                'reference'      => 'RPL-2024-00875',
                'status'         => 'shipped',
                'origin'         => ['name' => 'Central Hub', 'detail' => 'Kality Logistics Center'],
                'destination'    => ['name' => 'Main Store', 'detail' => 'Merkato Terminal 01'],
                'distance_km'    => 18.4,
                'scheduled_run'  => '2024-10-23T08:00',
                'cutoff_label'   => 'Delivered 08:52 AM',
                'sku_count'      => 3,
                'total_cartons'  => 150,
                'total_cbm'      => 8.7,
                'vehicle_max_cbm'=> 14.5,
                'load_percentage'=> 60,
                'vehicle_name'   => 'Isuzu NPR Box Truck',
                'vehicle_plate'  => 'ET-3-9482',
                'slot'           => 'BAY #04',
                'created_by'     => 'Admin',
                'created_at'     => 'Yesterday • 06:14 AM',
            ],
        ];
=======
    use DrivesShipments;

    public function __construct(
        private readonly ShipmentWorkflowService $workflow,
        private readonly StockKeeperService $stock,
    ) {
>>>>>>> e13f568 (second week session)
    }

    protected function shipmentRole(): string
    {
        return 'seller';
    }

    /**
     * A seller only ever sees shipments with their store at one end.
     *
     * @return array<int, int>|null
     */
    protected function shipmentStoreScope(): ?array
    {
        return $this->ownStoreScope();
    }

    public function index(Request $request): Response
    {
        $storeId = (int) (Auth::user()->store_id ?? 0);
        $direction = $request->string('direction')->toString() ?: 'inbound';

        $query = Shipment::query()->with(['origin', 'destination', 'courier', 'creator', 'items.itemVariant.item']);

        $direction === 'outbound'
            ? $query->outboundFrom($storeId)
            : $query->inboundTo($storeId);

        $paginator = $query->orderByDesc('id')->paginate(20)->withQueryString();

        return Inertia::render('Seller/Shipments/index', [
            'shipments' => collect($paginator->items())
                ->map(fn (Shipment $s) => $this->workflow->present($s, 'seller'))
                ->values()
                ->all(),
            'filters' => ['direction' => $direction],
            'own_store_id' => $storeId,
            'counts' => [
                'inbound' => Shipment::query()->inboundTo($storeId)->open()->count(),
                'outbound' => Shipment::query()->outboundFrom($storeId)->open()->count(),
                'awaiting_receipt' => Shipment::query()
                    ->inboundTo($storeId)
                    ->where('status', ShipmentWorkflowService::DELIVERED)
                    ->count(),
            ],
            'stores' => Store::query()->where('id', '!=', $storeId)->orderBy('name')->get(['id', 'name', 'location']),
            'pagination' => [
                'current_page' => $paginator->currentPage(),
                'last_page' => $paginator->lastPage(),
                'total' => $paginator->total(),
            ],
        ]);
    }

    public function show(Shipment $shipment): Response
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        return Inertia::render('Seller/Shipments/Show', [
            'shipment' => $this->workflow->present($shipment, 'seller'),
            'variants' => $this->stock->variantOptions()->all(),
        ]);
    }

    /**
     * Raise a replenishment request: stock moving from another store into mine.
     */
    public function store(StoreShipmentRequest $request): RedirectResponse
    {
        $storeId = (int) (Auth::user()->store_id ?? 0);

        // A seller may only request stock *into* their own store.
        if ((int) $request->validated('destination_store_id') !== $storeId) {
            return back()->withErrors([
                'destination_store_id' => 'You can only request shipments into your own store.',
            ]);
        }

        try {
            $shipment = $this->workflow->create(
                (int) $request->validated('origin_store_id'),
                $storeId,
                collect($request->validated())
                    ->only(['scheduled_for', 'notes'])
                    ->filter(fn ($v) => $v !== null)
                    ->all(),
                Auth::id(),
            );
        } catch (\InvalidArgumentException $e) {
            return back()->withErrors(['origin_store_id' => $e->getMessage()]);
        }

        return redirect()
            ->route('seller.shipments.show', $shipment)
            ->with('success', "Replenishment {$shipment->reference} opened.");
    }

    public function addItem(StoreShipmentItemRequest $request, Shipment $shipment): RedirectResponse
    {
        abort_unless($this->shipmentIsInScope($shipment), 403);

        $variant = ItemVariant::findOrFail((int) $request->validated('item_variant_id'));

        try {
            $this->workflow->addItem(
                $shipment,
                $variant,
                (int) $request->validated('quantity'),
                collect($request->validated())
                    ->only(['cbm', 'weight_kg', 'unit', 'location'])
                    ->filter(fn ($v) => $v !== null)
                    ->all(),
            );
        } catch (\RuntimeException | \InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Manifest updated.');
    }

    public function transition(TransitionShipmentRequest $request, Shipment $shipment): RedirectResponse
    {
        return $this->driveShipment($request, $shipment, $this->workflow);
    }
}
