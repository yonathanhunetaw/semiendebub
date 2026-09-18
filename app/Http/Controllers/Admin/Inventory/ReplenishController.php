<?php

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class ReplenishController extends Controller
{
    /**
     * Display the replenishment shipment builder.
     *
     * In a full implementation this would load:
     * - Available vehicles from a Fleet model
     * - Low-stock / OOS SKUs from the StockLine model
     * - Warehouse → Store routes from location definitions
     *
     * For now, we pass structured demo data so the UI is immediately functional.
     */
    public function index()
    {
        // Demo vehicles — replace with Fleet::available()->get() when model exists
        $vehicles = [
            [
                'id'          => 'isuzu-npr',
                'name'        => 'Isuzu NPR Box Truck',
                'plate'       => 'ET-3-9482',
                'icon'        => 'rv_hookup',
                'max_cbm'     => 14.5,
                'payload_kg'  => 4200,
                'bay'         => 'BAY 04',
                'is_primary'  => true,
            ],
            [
                'id'          => 'suzuki-carry',
                'name'        => 'Suzuki Carry Mini Van',
                'plate'       => 'ET-2-1104',
                'icon'        => 'directions_car',
                'max_cbm'     => 3.2,
                'payload_kg'  => 850,
                'bay'         => null,
                'is_primary'  => false,
            ],
        ];

        // Demo manifest items — replace with StockLine OOS/low-stock query
        $manifestItems = [
            [
                'id'           => 127,
                'name'         => 'Noteit Sticky Notes 3x3',
                'sku'          => 'SKU-127',
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

        return Inertia::render('Admin/Inventory/Replenish/index', [
            'origin' => [
                'name'    => 'Central Hub',
                'detail'  => 'Kality Logistics Center',
                'icon'    => 'home_work',
            ],
            'destination' => [
                'name'    => 'Main Store',
                'detail'  => 'Merkato Terminal 01',
                'icon'    => 'store',
            ],
            'distance_km'       => 18.4,
            'scheduled_run'     => 'Tomorrow, Oct 24 • 08:30 AM',
            'cutoff_label'      => 'Cutoff in 4h 15m',
            'vehicles'          => $vehicles,
            'manifest_items'    => $manifestItems,
        ]);
    }

    /**
     * Store / dispatch the replenishment shipment.
     * Wire this up to a Shipment / Transfer model when ready.
     */
    public function store()
    {
        // TODO: Validate and persist replenishment shipment
        return back()->with('success', 'Replenishment shipment dispatched successfully.');
    }
}
