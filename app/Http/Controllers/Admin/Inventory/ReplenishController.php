<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin\Inventory;

use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;

/**
 * Retired: the old replenishment wizard.
 *
 * It ran on hardcoded demo shipments, vehicles and manifests, and its
 * "dispatch" changed nothing — a second, fake copy of the real shipment board.
 * Restocking a store is a shipment from Main Hub A/B (carried by Delivery) or
 * a transfer from its Remote Hub; both have real boards. Every old address now
 * lands on the shipment board so bookmarks and links keep working.
 */
class ReplenishController extends Controller
{
    public function index(): RedirectResponse
    {
        return $this->toShipments();
    }

    public function show(int $transfer): RedirectResponse
    {
        return $this->toShipments();
    }

    public function review(int $transfer): RedirectResponse
    {
        return $this->toShipments();
    }

    public function dispatched(int $transfer): RedirectResponse
    {
        return $this->toShipments();
    }

    public function store(): RedirectResponse
    {
        return $this->toShipments()->with('error', 'Restocking now runs as a shipment from Main Hub A or B. Raise one here.');
    }

    public function dispatch(int $transfer): RedirectResponse
    {
        return $this->toShipments()->with('error', 'Restocking now runs as a shipment from Main Hub A or B. Raise one here.');
    }

    private function toShipments(): RedirectResponse
    {
        return redirect()->route('admin.inventory.shipments.index');
    }
}
