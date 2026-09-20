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
                'vehicle_name'   => 'Isuzu NPR Box Truck',
                'vehicle_plate'  => 'ET-3-9482',
                'slot'           => 'SLOT #04',
            ],
            [
                'id'             => 2,
                'reference'      => 'RPL-2024-00872',
                'status'         => 'pending',
                'origin'         => ['name' => 'Central Hub', 'detail' => 'Kality Logistics Center'],
                'destination'    => ['name' => 'Branch Store', 'detail' => 'Piazza Terminal 02'],
                'distance_km'    => 9.1,
                'scheduled_run'  => '2024-10-25T10:00',
                'cutoff_label'   => 'Cutoff in 26h',
                'sku_count'      => 5,
                'total_cartons'  => 80,
                'vehicle_name'   => 'Suzuki Carry Mini Van',
                'vehicle_plate'  => 'ET-2-1104',
                'slot'           => 'SLOT #02',
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
                'vehicle_name'   => 'Isuzu NPR Box Truck',
                'vehicle_plate'  => 'ET-3-9482',
                'slot'           => 'SLOT #01',
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
