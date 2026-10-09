<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Customer\AdminCustomerRequest;
use App\Models\Auth\Customer;
use App\Models\Store\StoreVariantCustomerPrice;
use App\Services\Admin\ActiveStore;
use Illuminate\Http\Request;
use Inertia\Inertia;

/**
 * Customers of the active store (every store's for a global admin on "All
 * stores"). A customer belongs to one store; someone who buys at two stores is
 * two customer records.
 */
class CustomerController extends Controller
{
    public function __construct(private readonly ActiveStore $activeStore)
    {
    }

    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $customers = $this->activeStore->apply(Customer::query())
            ->with(['creator', 'store:id,name'])
            ->latest()
            ->get();

        return Inertia::render('Admin/Customers/Index', [
            'customers' => $customers,
            // The store picker on the create/edit dialog: a store admin's
            // stores only, every store for a global admin.
            'stores' => $this->activeStore->accessibleStores()
                ->map(fn ($store): array => ['id' => (int) $store->id, 'name' => (string) $store->name])
                ->values(),
        ]);
    }

    /**
     * Prices and discounts set for one customer on one store item ("Edit price
     * & rule" on a store's item page), with when each discount ends.
     *
     * A row is `active` while its discount runs (no end date, or one still
     * ahead), `expired` once the end date has passed, and `price` when it is a
     * negotiated price with no discount on top.
     */
    public function discounts(Request $request)
    {
        $filter = in_array($request->query('status'), ['active', 'expired', 'price', 'all'], true)
            ? (string) $request->query('status')
            : 'active';

        $now = now();

        $rows = $this->activeStore->applyThrough(StoreVariantCustomerPrice::query(), 'storeVariant')
            ->with([
                'customer:id,first_name,last_name,name,phone,phone_number,store_id',
                'storeVariant.store:id,name',
                'storeVariant.item:id,product_name',
                'storeVariant.itemVariant:id,sku,item_color_id,item_size_id,item_packaging_type_id',
                'storeVariant.itemVariant.itemColor:id,name',
                'storeVariant.itemVariant.itemSize:id,name',
                'storeVariant.itemVariant.itemPackagingType:id,name',
            ])
            ->latest('updated_at')
            ->get()
            ->map(function (StoreVariantCustomerPrice $price) use ($now): array {
                // Customer prices are a flat {price, discount_price, discount_ends_at};
                // tolerate a one-tier ladder too.
                $matrix = (array) ($price->pricing_matrix ?? []);
                $tier = isset($matrix[0]) && is_array($matrix[0]) ? $matrix[0] : $matrix;

                $discount = isset($tier['discount_price']) && $tier['discount_price'] !== null ? (float) $tier['discount_price'] : null;
                $endsAt = ! empty($tier['discount_ends_at']) ? \Illuminate\Support\Carbon::parse($tier['discount_ends_at']) : null;

                $status = match (true) {
                    $discount === null => 'price',
                    $endsAt !== null && $endsAt->endOfDay()->lt($now) => 'expired',
                    default => 'active',
                };

                $sv = $price->storeVariant;
                $variant = $sv?->itemVariant;

                return [
                    'id' => (int) $price->id,
                    'customer' => $price->customer?->name,
                    'customer_phone' => $price->customer?->phone,
                    'store_id' => $sv?->store_id !== null ? (int) $sv->store_id : null,
                    'store' => $sv?->store?->name,
                    'item_id' => $sv?->item_id !== null ? (int) $sv->item_id : null,
                    'item' => $sv?->item?->product_name ?? 'Unknown item',
                    'variant' => collect([$variant?->itemColor?->name, $variant?->itemSize?->name, $variant?->itemPackagingType?->name])->filter()->join(' / ') ?: null,
                    'sku' => $variant?->sku,
                    'price' => isset($tier['price']) ? (float) $tier['price'] : null,
                    'discount_price' => $discount,
                    'discount_ends_at' => $endsAt?->toDateString(),
                    'days_left' => $status === 'active' && $endsAt !== null ? (int) $now->copy()->startOfDay()->diffInDays($endsAt->copy()->startOfDay()) : null,
                    'status' => $status,
                ];
            });

        return Inertia::render('Admin/Customers/Discounts', [
            'discounts' => $filter === 'all' ? $rows->values() : $rows->where('status', $filter)->values(),
            'counts' => [
                'active' => $rows->where('status', 'active')->count(),
                'expired' => $rows->where('status', 'expired')->count(),
                'price' => $rows->where('status', 'price')->count(),
                'all' => $rows->count(),
            ],
            'filters' => ['status' => $filter],
        ]);
    }

    /**
     * Store a newly created resource in storage.
     *
     * The store is decided server-side: a store admin always writes their own.
     */
    public function store(AdminCustomerRequest $request)
    {
        Customer::create([
            ...$request->customerData(),
            'store_id' => $this->activeStore->storeIdForWrite($request->validated('store_id')),
            'created_by' => auth()->id(),
        ]);

        return redirect()->back()->with('success', 'Customer created successfully.');
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(AdminCustomerRequest $request, string $id)
    {
        $customer = $this->scopedCustomer($id);
        $data = $request->customerData();

        // Moving a customer to another store is a global admin's call, and
        // only when the form asked for it.
        unset($data['store_id']);
        if ($this->activeStore->isGlobal() && $request->filled('store_id')) {
            $data['store_id'] = (int) $request->validated('store_id');
        }

        $customer->update($data);

        return redirect()->back()->with('success', 'Customer updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        $this->scopedCustomer($id)->delete();

        return redirect()->back()->with('success', 'Customer deleted successfully.');
    }

    /** A customer the user may touch; another store's is a 404. */
    private function scopedCustomer(string $id): Customer
    {
        $customer = Customer::findOrFail($id);

        abort_unless($this->activeStore->allows($customer->store_id !== null ? (int) $customer->store_id : null), 404);

        return $customer;
    }
}
