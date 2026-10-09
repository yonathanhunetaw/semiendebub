<?php

declare(strict_types=1);

namespace App\Services\Admin;

use App\Models\Auth\Customer;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Seller\Cart;

/**
 * The sidebar's count badges, scoped to the active store: open carts,
 * customers, orders still in progress, and deliveries on the road or waiting.
 */
final class AdminNavCounts
{
    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    /** @return array<string, int> */
    public function counts(): array
    {
        return [
            'carts' => $this->activeStore->apply(Cart::query())->where('status', 'open')->count(),
            'customers' => $this->activeStore->apply(Customer::query())->count(),
            'orders' => $this->activeStore->apply(Sale::query())
                ->whereNotIn('fulfillment_stage', [Sale::STAGE_DELIVERED, Sale::STAGE_CANCELLED])
                ->count(),
            'deliveries' => $this->activeStore->applyThrough(Delivery::query(), 'sale')->open()->count(),
        ];
    }
}
