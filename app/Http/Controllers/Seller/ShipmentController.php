<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Controller;
use Inertia\Inertia;

class ShipmentController extends Controller
{
    /**
     * Display incoming replenishment shipments for the seller's store.
     *
     * In a full implementation, this would filter shipments by the
     * authenticated user's assigned store (store_id on the User model).
     */
    public function index()
    {
        // Demo vehicles
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

        // Demo manifest items
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

        return Inertia::render('Seller/Shipments/index', [
            'origin' => [
                'name'   => 'Central Hub',
                'detail' => 'Kality Logistics Center',
            ],
            'destination' => [
                'name'   => 'Main Store',
                'detail' => 'Merkato Terminal 01',
            ],
            'distance_km'       => 18.4,
            'scheduled_run'     => 'Tomorrow, Oct 24 • 08:30 AM',
            'cutoff_label'      => 'Cutoff in 4h 15m',
            'vehicles'          => $vehicles,
            'manifest_items'    => $manifestItems,
        ]);
    }
}
