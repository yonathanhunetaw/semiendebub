<?php

namespace App\Http\Controllers\Admin;

use App\Models\Auth\Customer;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Inertia\Inertia;

//         GET /customers – index (list all customers)
//         GET /customers/create – create (show form to create a new customer)
//         POST /customers – store (save new customer)
//         GET /customers/{customer} – show (show a single customer)
//         GET /customers/{customer}/edit – edit (show form to edit a customer)
//         PUT/PATCH /customers/{customer} – update (update an existing customer)
//         DELETE /customers/{customer} – destroy (delete a customer)

class CustomerController extends Controller
{
    /**
     * Display a listing of the resource.
     */
    public function index(Request $request)
    {
        $customers = Customer::with('creator')->latest()->get();

        return Inertia::render('Admin/Customers/Index', [
            'customers' => $customers
        ]);
    }

    /**
     * Store a newly created resource in storage.
     */
    public function store(Request $request)
    {
        $validatedCustomer = $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|email|unique:customers',
            'phone_number' => 'required|string|max:20|unique:customers,phone_number',
            'city' => 'nullable|string',
            'tin_number' => 'nullable|string|max:10|unique:customers',
        ]);

        $validatedCustomer['created_by'] = auth()->id();

        if (! empty($validatedCustomer['city'])) {
            $validatedCustomer['city'] = Str::title($validatedCustomer['city']);
        }

        Customer::create($validatedCustomer);

        return redirect()->back()->with('success', 'Customer created successfully.');
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(Request $request, string $id)
    {
        $validated = $request->validate([
            'first_name' => 'required|string|max:255',
            'last_name' => 'nullable|string|max:255',
            'email' => 'required|email|max:255|unique:customers,email,' . $id,
            'phone_number' => 'required|string|max:20|unique:customers,phone_number,' . $id,
            'city' => 'nullable|string|max:255',
            'tin_number' => 'nullable|string|max:10|unique:customers,tin_number,' . $id,
        ]);

        if (! empty($validated['city'])) {
            $validated['city'] = Str::title($validated['city']);
        }

        $customer = Customer::findOrFail($id);
        $customer->update($validated);

        return redirect()->back()->with('success', 'Customer updated successfully.');
    }

    /**
     * Remove the specified resource from storage.
     */
    public function destroy(string $id)
    {
        $customer = Customer::findOrFail($id);
        $customer->delete();

        return redirect()->back()->with('success', 'Customer deleted successfully.');
    }
}
