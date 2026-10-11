<?php

namespace App\Http\Controllers\Seller;

use App\Exceptions\PaymentException;
use App\Http\Controllers\Admin\Controller;
use App\Http\Requests\Customer\SellerCustomerRequest;
use App\Http\Requests\Seller\SetPaymentPartsRequest;
use App\Models\Auth\Customer;
use App\Models\Finance\Payment;
use App\Services\Finance\CustomerCreditService;
use App\Services\Finance\PaymentBoard;
use App\Services\Finance\PaymentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;

class CustomerController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $customers = self::forSeller($request)->with('creator')
            ->orderBy('first_name')
            ->orderBy('last_name')
            ->get();

        return Inertia::render('Seller/Customers/Index', compact('customers'));
    }

    /**
     * Show the form for creating a new resource.
     */
    public function create()
    {
        return Inertia::render('Seller/Customers/Create');
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(SellerCustomerRequest $request)
    {
        // A TIN means "individual" and VAT-inclusive pricing, no TIN means
        // "business". Credit is never set here: only an admin gives it.
        // The customer belongs to the seller's store, like an admin's do.
        Customer::create([
            ...$request->customerData(),
            'store_id' => $request->user()->store_id,
            'created_by' => auth()->id(),
        ]);

        return redirect()->route('seller.customers.index')
            ->with('success', 'Customer created successfully.');
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Customer $customer, CustomerCreditService $credit, PaymentBoard $board)
    {
        $this->guard($request, $customer);
        $customer->load(['creator', 'carts', 'addresses']);

        return Inertia::render('Seller/Customers/Show', [
            'customer' => $customer,
            // What they owe and may still buy on credit. The seller sees it
            // and takes repayments; only an admin sets the limit.
            'credit' => $credit->summary($customer),
            // Where their orders have gone, saved at checkout.
            'addresses' => $customer->addresses->map->present()->values(),
            'invoices' => $credit->invoices((int) $customer->id),
            'repayments' => Payment::query()
                ->where('kind', Payment::KIND_REPAYMENT)
                ->where('customer_id', $customer->id)
                ->where('status', '!=', Payment::STATUS_VOID)
                ->with('account.owner')
                ->latest('id')
                ->limit(20)
                ->get()
                ->map(fn (Payment $payment): array => $board->part($payment))
                ->values(),
            'accounts' => $board->accountsFor($request->user()?->store_id !== null ? (int) $request->user()->store_id : null),
        ]);
    }

    /** The customer pays back credit, split across accounts and cash. */
    public function repay(SetPaymentPartsRequest $request, Customer $customer, PaymentService $payments): RedirectResponse
    {
        $this->guard($request, $customer);

        try {
            $payments->setRepayment($customer, $request->parts(), $request->user());
        } catch (PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Repayment recorded. Account parts wait for their owner to confirm them.');
    }

    /** The customer says they paid a repayment part into an account. */
    public function claimRepayment(Request $request, Customer $customer, int $payment, PaymentService $payments): RedirectResponse
    {
        $this->guard($request, $customer);
        $part = Payment::query()->where('kind', Payment::KIND_REPAYMENT)->where('customer_id', $customer->id)->findOrFail($payment);

        try {
            $payments->claim($part, $request->user());
        } catch (PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'The account owner will check it and confirm.');
    }

    /** Drop a repayment part the customer never paid. */
    public function voidRepayment(Request $request, Customer $customer, int $payment, PaymentService $payments): RedirectResponse
    {
        $this->guard($request, $customer);
        $part = Payment::query()->where('kind', Payment::KIND_REPAYMENT)->where('customer_id', $customer->id)->findOrFail($payment);

        try {
            $payments->voidRepayment($part);
        } catch (PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'Repayment part removed.');
    }

    /**
     * Show the form for editing the specified resource.
     */
    public function edit(Request $request, string $id)
    {
        $customer = self::forSeller($request)->findOrFail($id);

        return Inertia::render('Seller/Customers/Edit', compact('customer'));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(SellerCustomerRequest $request, string $id)
    {
        $customer = self::forSeller($request)->findOrFail($id);
        $customer->update($request->customerData());

        return redirect()->route('seller.customers.show', $customer->id)
            ->with('success', 'Customer updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(Request $request, string $id)
    {
        $customer = self::forSeller($request)->findOrFail($id);
        $customer->delete();

        return redirect()->route('seller.customers.index')
            ->with('success', 'Customer deleted successfully.');
    }

    /**
     * Customers of the seller's store. A seller with no store (an admin on
     * the seller app) sees every customer; customers saved before they had
     * a store stay visible to all.
     *
     * @return \Illuminate\Database\Eloquent\Builder<Customer>
     */
    public static function forSeller(Request $request): \Illuminate\Database\Eloquent\Builder
    {
        $storeId = $request->user()?->store_id;

        return Customer::query()->when($storeId !== null, fn ($query) => $query
            ->where(fn ($q) => $q->where('store_id', $storeId)->orWhereNull('store_id')));
    }

    /** Another store's customer is a 404. */
    private function guard(Request $request, Customer $customer): void
    {
        abort_unless(self::forSeller($request)->whereKey($customer->id)->exists(), 404);
    }
}
