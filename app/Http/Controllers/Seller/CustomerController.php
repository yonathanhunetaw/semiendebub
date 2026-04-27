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
     * Display a listing of the resource.
     */
    public function index()
    {
        $customers = Customer::with('creator')->latest()->get();

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
        ]);

        $validated['created_by'] = auth()->id();

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
        ]);

        if (! empty($validated['city'])) {
            $validated['city'] = Str::title($validated['city']);
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
