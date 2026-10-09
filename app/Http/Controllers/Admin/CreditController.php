<?php

declare(strict_types=1);

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Http\Requests\Customer\SetCreditOverrideRequest;
use App\Models\Auth\Customer;
use App\Models\Finance\Payment;
use App\Services\Finance\CustomerCreditService;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Customer credit across the business: who has credit, what they owe, and
 * who is overdue. Limits are set on the customer (Admin → Customers); here an
 * admin can let an overdue customer keep buying on credit.
 */
class CreditController extends Controller
{
    public function index(CustomerCreditService $credit): Response
    {
        $owing = Payment::query()
            ->where('payment_method', Payment::METHOD_CREDIT)
            ->join('sales', 'sales.id', '=', 'payments.sale_id')
            ->distinct()
            ->pluck('sales.customer_id');

        $customers = Customer::query()
            ->where(fn ($q) => $q->where('credit_limit', '>', 0)->orWhereIn('id', $owing))
            ->get()
            ->map(function (Customer $customer) use ($credit): ?array {
                $summary = $credit->summary($customer);

                return $summary === null ? null : $summary + [
                    'name' => (string) $customer->name,
                    'phone' => $customer->phone,
                    'invoices' => collect($credit->invoices((int) $customer->id))->where('owed', '>', 0)->values(),
                ];
            })
            ->filter()
            ->sortByDesc(fn (array $row): float => $row['overdue'] * 1_000_000_000 + $row['outstanding'])
            ->values();

        return Inertia::render('Admin/Payments/Credit', [
            'customers' => $customers,
        ]);
    }

    public function override(SetCreditOverrideRequest $request, Customer $customer): RedirectResponse
    {
        $customer->update(['credit_override' => (bool) $request->validated('credit_override')]);

        return back()->with('success', $customer->credit_override
            ? "{$customer->name} can buy on credit while overdue."
            : "{$customer->name} is blocked from credit while overdue.");
    }
}
