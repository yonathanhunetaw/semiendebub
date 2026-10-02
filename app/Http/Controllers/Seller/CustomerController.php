<?php

namespace App\Http\Controllers\Seller;

use App\Http\Controllers\Admin\Controller;
use App\Models\Auth\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;

class CustomerController extends Controller
{
    /**
     * A blank TIN is a business, so it is stored as null rather than "".
     *
     * Every customer-type check in the application is `->tin_number ?` or
     * `! empty(...)`, and an empty string reads false to those but still
     * collides with the unique index on the second business created.
     */
    private function normaliseTin(?string $tin): ?string
    {
        $tin = trim((string) $tin);

        return $tin === '' ? null : $tin;
    }

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
    public function store(Request $request)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|email|unique:customers,email',
            'phone_number' => 'required|string|max:20|unique:customers,phone_number',
            'city' => 'nullable|string|max:255',
            // Customer type, as the rest of the application reads it: a TIN
            // means "individual" and VAT-inclusive pricing, no TIN means
            // "business". Admin\CustomerController has always accepted this;
            // omitting it here meant every customer a seller created was a
            // business, whatever the seller intended.
            'tin_number' => 'nullable|string|max:10|unique:customers,tin_number',
        ]);

        $validated['created_by'] = auth()->id();

        // An empty string is a business, not a TIN of "". Stored as null so
        // the unique rule and every `->tin_number ?` check agree.
        $validated['tin_number'] = $this->normaliseTin($validated['tin_number'] ?? null);

        if (! empty($validated['city'])) {
            $validated['city'] = Str::title($validated['city']);
        }

        Customer::create($validated);

        return redirect()->route('seller.customers.index')
            ->with('success', 'Customer created successfully.');
    }

    /**
     * Display the specified resource.
     */
    public function show(Customer $customer)
    {
        $customer->load(['creator', 'carts']);

        return Inertia::render('Seller/Customers/Show', compact('customer'));
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
    public function update(Request $request, string $id)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|email|max:255|unique:customers,email,'.$id,
            'phone_number' => 'required|string|max:20|unique:customers,phone_number,'.$id,
            'city' => 'nullable|string|max:255',
            'tin_number' => 'nullable|string|max:10|unique:customers,tin_number,'.$id,
        ]);

        if (! empty($validated['city'])) {
            $validated['city'] = Str::title($validated['city']);
        }

        // Only when the form sent the field, so a caller that omits it does
        // not silently turn an individual into a business.
        if ($request->has('tin_number')) {
            $validated['tin_number'] = $this->normaliseTin($validated['tin_number'] ?? null);
        }

        $customer = Customer::findOrFail($id);
        $customer->update($validated);

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
