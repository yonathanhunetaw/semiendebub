<?php

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class ReplenishController extends Controller
{
    // ── Shared demo data helpers ──────────────────────────────────────────────

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
                'scheduled_run'  => 'Tomorrow, Oct 24 • 08:30 AM',
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
                'scheduled_run'  => 'Oct 25 • 10:00 AM',
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
                'scheduled_run'  => 'Oct 23 • 07:00 AM',
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
        return collect($transfers)->firstWhere('id', $id)
            ?? $transfers[0];
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

    // ── Phase 0: Scheduled Transfer Selection List ────────────────────────────

    public function index()
    {
        return Inertia::render('Admin/Inventory/Replenish/index', [
            'scheduled_transfers' => $this->demoScheduledTransfers(),
        ]);
    }

    // ── Phase 1: Manifest Builder (scoped to a specific transfer) ─────────────

    public function show(int $transfer)
    {
        $transferData = $this->demoTransferById($transfer);

        return Inertia::render('Admin/Inventory/Replenish/Build/index', [
            'transfer_id'    => $transfer,
            'origin'         => $transferData['origin'],
            'destination'    => $transferData['destination'],
            'distance_km'    => $transferData['distance_km'],
            'scheduled_run'  => $transferData['scheduled_run'],
            'cutoff_label'   => $transferData['cutoff_label'],
            'vehicles'       => $this->demoVehicles(),
            'manifest_items' => $this->demoManifestItems(),
        ]);
    }

    // ── Phase 2: Review & Dispatch ────────────────────────────────────────────

    public function review(int $transfer)
    {
        $transferData = $this->demoTransferById($transfer);
        $items        = $this->demoManifestItems();

        $totalCbm = array_sum(array_column($items, 'cbm'));
        $totalKg  = array_sum(array_column($items, 'weight_kg'));
        $totalCtns = array_sum(array_column($items, 'quantity'));
        $vehicle  = $this->demoVehicles()[0];

        return Inertia::render('Admin/Inventory/Replenish/Review/index', [
            'transfer_id'    => $transfer,
            'reference'      => $transferData['reference'],
            'origin'         => $transferData['origin'],
            'destination'    => $transferData['destination'],
            'distance_km'    => $transferData['distance_km'],
            'scheduled_run'  => $transferData['scheduled_run'],
            'cutoff_label'   => $transferData['cutoff_label'],
            'slot'           => $transferData['slot'],
            'vehicle'        => $vehicle,
            'manifest_items' => $items,
            'total_cbm'      => $totalCbm,
            'total_kg'       => $totalKg,
            'total_cartons'  => $totalCtns,
        ]);
    }

    // ── Dispatch action (POST) ────────────────────────────────────────────────

    public function dispatch(int $transfer)
    {
        // TODO: Mark Transfer as dispatched, create Delivery record
        return redirect()->route('admin.inventory.replenish.dispatched', $transfer)
            ->with('success', 'Shipment dispatched successfully.');
    }

    // ── Phase 3: Dispatched / Success ─────────────────────────────────────────

    public function dispatched(int $transfer)
    {
        $transferData = $this->demoTransferById($transfer);
        $items        = $this->demoManifestItems();

        return Inertia::render('Admin/Inventory/Replenish/Dispatched/index', [
            'transfer_id'    => $transfer,
            'reference'      => $transferData['reference'],
            'origin'         => $transferData['origin'],
            'destination'    => $transferData['destination'],
            'vehicle'        => $this->demoVehicles()[0],
            'manifest_items' => $items,
            'total_cbm'      => array_sum(array_column($items, 'cbm')),
            'total_kg'       => array_sum(array_column($items, 'weight_kg')),
            'total_cartons'  => array_sum(array_column($items, 'quantity')),
            'driver' => [
                'name'  => 'Abebe Kebede',
                'phone' => '+251911002233',
            ],
            'gate_pass'      => 'GP-88301',
            'departure_time' => '08:35 AM',
            'eta'            => '09:12 AM',
            'est_mins'       => 28,
            'transit_pct'    => 38,
        ]);
    }

    // ── Legacy POST store (Phase 1 → Phase 2 redirect) ───────────────────────

    public function store()
    {
        // After building the manifest, redirect to review
        // In a real implementation, persist manifest to session/DB first
        return redirect()->route('admin.inventory.replenish.review', 1);
    }
}
