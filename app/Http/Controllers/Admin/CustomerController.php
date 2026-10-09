<?php

namespace App\Http\Controllers\Admin;

use App\Http\Requests\Customer\AdminCustomerRequest;
use App\Models\Auth\Customer;
use Illuminate\Http\Request;
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
    public function store(AdminCustomerRequest $request)
    {
        Customer::create([...$request->customerData(), 'created_by' => auth()->id()]);

        return redirect()->back()->with('success', 'Customer created successfully.');
    }

    /**
     * Update the specified resource in storage.
     */
    public function update(AdminCustomerRequest $request, string $id)
    {
        $customer = Customer::findOrFail($id);
        $customer->update($request->customerData());

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
