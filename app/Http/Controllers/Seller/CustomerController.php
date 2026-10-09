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
    public function index()
    {
        $customers = Customer::with('creator')
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
        Customer::create([...$request->customerData(), 'created_by' => auth()->id()]);

        return redirect()->route('seller.customers.index')
            ->with('success', 'Customer created successfully.');
    }

    /**
     * Display the specified resource.
     */
    public function show(Request $request, Customer $customer, CustomerCreditService $credit, PaymentBoard $board)
    {
        $customer->load(['creator', 'carts']);

        return Inertia::render('Seller/Customers/Show', [
            'customer' => $customer,
            // What they owe and may still buy on credit. The seller sees it
            // and takes repayments; only an admin sets the limit.
            'credit' => $credit->summary($customer),
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
        $part = Payment::query()->where('kind', Payment::KIND_REPAYMENT)->where('customer_id', $customer->id)->findOrFail($payment);

        try {
            $payments->claim($part, $request->user());
        } catch (PaymentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', 'The account owner will check it and confirm.');
    }

    /** Drop a repayment part the customer never paid. */
    public function voidRepayment(Customer $customer, int $payment, PaymentService $payments): RedirectResponse
    {
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
    public function edit(string $id)
    {
        $customer = Customer::findOrFail($id);

        return Inertia::render('Seller/Customers/Edit', compact('customer'));
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(SellerCustomerRequest $request, string $id)
    {
        $customer = Customer::findOrFail($id);
        $customer->update($request->customerData());

        return redirect()->route('seller.customers.show', $customer->id)
            ->with('success', 'Customer updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        $customer = Customer::findOrFail($id);
        $customer->delete();

        return redirect()->route('seller.customers.index')
            ->with('success', 'Customer deleted successfully.');
    }
}
