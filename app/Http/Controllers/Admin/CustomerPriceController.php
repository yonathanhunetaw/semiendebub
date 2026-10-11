<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Pricing\BulkCustomerPriceRequest;
use App\Http\Requests\Pricing\CustomerItemPricesRequest;
use App\Models\Auth\Customer;
use App\Models\Store\StoreVariant;
use App\Services\Admin\ActiveStore;
use App\Services\Pricing\CustomerPriceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;
use InvalidArgumentException;

/**
 * A customer's own prices in bulk: one customer across many items (this
 * customer's price sheet), and one store item for many customers (from the
 * item's price editor).
 */
class CustomerPriceController extends Controller
{
    public function __construct(
        private readonly ActiveStore $activeStore,
        private readonly CustomerPriceService $prices,
    ) {
    }

    public function index(Customer $customer): Response
    {
        $this->guard($customer);

        return Inertia::render('Admin/Customers/Prices', [
            'customer' => [
                'id' => (int) $customer->id,
                'name' => $customer->name,
                'type' => $customer->tin_number ? 'individual' : 'business',
                'store' => $customer->store?->name,
            ],
            'rows' => $customer->store_id !== null ? $this->prices->sheet($customer) : [],
        ]);
    }

    public function update(CustomerItemPricesRequest $request, Customer $customer): RedirectResponse
    {
        $this->guard($customer);

        try {
            $result = $this->prices->forManyItems($customer, $request->validated('rows'));
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', sprintf('%d price(s) saved, %d removed for %s.', $result['saved'], $result['removed'], $customer->name));
    }

    /** One store item, one price, for every chosen customer. */
    public function bulk(BulkCustomerPriceRequest $request, StoreVariant $storeVariant): JsonResponse
    {
        try {
            $rows = $this->prices->forManyCustomers($storeVariant, $request->validated('customer_ids'), $request->validated());
        } catch (InvalidArgumentException $e) {
            return response()->json(['message' => $e->getMessage()], 422);
        }

        return response()->json($rows->load('customer')->values());
    }

    private function guard(Customer $customer): void
    {
        abort_unless($this->activeStore->allows($customer->store_id !== null ? (int) $customer->store_id : null), 404);
    }
}
