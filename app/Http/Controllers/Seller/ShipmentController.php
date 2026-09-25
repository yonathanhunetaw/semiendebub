<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use Inertia\Inertia;
use Illuminate\Http\Request;

class ShipmentController extends Controller
{
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
    }

    private function demoTransferById(int $id): array
    {
        $transfers = $this->demoScheduledTransfers();
        return collect($transfers)->firstWhere('id', $id) ?? $transfers[0];
    }

    private function demoVehicles(): array
    {
        return [
            [
                'id'         => 'isuzu-npr',
                'name'       => 'Isuzu NPR Box Truck',
                'plate'      => 'ET-3-9482',
                'icon'       => 'rv_hookup',
                'max_cbm'    => 14.5,
                'payload_kg' => 4200,
                'bay'        => 'BAY 04',
                'is_primary' => true,
            ],
            [
                'id'         => 'suzuki-carry',
                'name'       => 'Suzuki Carry Mini Van',
                'plate'      => 'ET-2-1104',
                'icon'       => 'directions_car',
                'max_cbm'    => 3.2,
                'payload_kg' => 850,
                'bay'        => null,
                'is_primary' => false,
            ],
        ];
    }

    private function demoManifestItems(): array
    {
        return [
            [
                'id'           => 127,
                'name'         => 'Noteit Sticky Notes 3x3',
                'sku'          => 'SKU-127',
                'pack_label'   => 'Pack 100',
                'status'       => 'oos',
                'status_label' => 'CRITICAL OOS',
                'stock_qty'    => 0,
                'quantity'     => 40,
                'unit'         => 'Ctns',
                'cbm'          => 1.8,
                'weight_kg'    => 480,
                'location'     => 'Aisle A-04 | Shelf 2',
                'icon'         => 'report',
            ],
            [
                'id'           => 204,
                'name'         => 'Thermal Receipt Rolls 80mm',
                'sku'          => 'SKU-204',
                'pack_label'   => '50 Rolls/Box',
                'status'       => 'low',
                'status_label' => 'LOW STOCK',
                'stock_qty'    => 12,
                'quantity'     => 60,
                'unit'         => 'Bx',
                'cbm'          => 3.2,
                'weight_kg'    => 960,
                'location'     => 'Aisle B-08 | Shelf 1',
                'icon'         => 'warning',
            ],
            [
                'id'           => 108,
                'name'         => 'A4 Copy Paper 80gsm',
                'sku'          => 'SKU-108',
                'pack_label'   => '5 Reams/Ctn',
                'status'       => 'regular',
                'status_label' => 'REGULAR RESTOCK',
                'stock_qty'    => null,
                'quantity'     => 50,
                'unit'         => 'Ctns',
                'cbm'          => 3.7,
                'weight_kg'    => 1200,
                'location'     => 'Aisle D-01 | Bulk Floor',
                'icon'         => 'inventory',
            ],
        ];
    }

    public function index()
    {
        return Inertia::render('Seller/Shipments/index', [
            'scheduled_transfers' => $this->demoScheduledTransfers(),
        ]);
    }

    public function show(int $id)
    {
        $transfer = $this->demoTransferById($id);

        return Inertia::render('Seller/Shipments/Build/index', array_merge(
            $transfer,
            [
                'transfer_id'    => $id,
                'vehicles'       => $this->demoVehicles(),
                'manifest_items' => $this->demoManifestItems(),
            ]
        ));
    }

    public function review(int $id)
    {
        $transfer = $this->demoTransferById($id);
        $vehicle = collect($this->demoVehicles())->firstWhere('id', 'isuzu-npr');

        return Inertia::render('Seller/Shipments/Review/index', array_merge(
            $transfer,
            [
                'transfer_id'    => $id,
                'vehicle'        => $vehicle,
                'manifest_items' => $this->demoManifestItems(),
                'total_cbm'      => 8.7,
                'total_kg'       => 2640,
                'total_cartons'  => 150,
            ]
        ));
    }

    public function dispatch(Request $request, int $id)
    {
        // ... logic
        return redirect()->route('seller.shipments.dispatched', $id);
    }

    public function dispatched(int $id)
    {
        $transfer = $this->demoTransferById($id);
        $vehicle = collect($this->demoVehicles())->firstWhere('id', 'isuzu-npr');

        return Inertia::render('Seller/Shipments/Dispatched/index', array_merge(
            $transfer,
            [
                'transfer_id'    => $id,
                'vehicle'        => $vehicle,
                'manifest_items' => $this->demoManifestItems(),
                'total_cbm'      => 8.7,
                'total_kg'       => 2640,
                'total_cartons'  => 150,
                'driver'         => ['name' => 'Amanuel T.', 'phone' => '+251 911 23 45 67'],
                'gate_pass'      => 'GP-' . strtoupper(substr(uniqid(), -6)),
                'departure_time' => now()->format('H:i A'),
                'eta'            => now()->addMinutes(38)->format('H:i A'),
                'est_mins'       => 38,
                'transit_pct'    => 38,
            ]
        ));
    }

    // fallback for the form builder
    public function store(Request $request, int $id)
    {
        return redirect()->route('seller.shipments.review', $id);
    }
}
