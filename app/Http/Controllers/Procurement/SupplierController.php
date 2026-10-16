<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\SaveSupplierRequest;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use App\Services\Procurement\PurchaseOrderPresenter;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The shops procurement buys from. A record, no login.
 */
class SupplierController extends Controller
{
    public function index(Request $request): Response
    {
        $search = trim((string) $request->string('search'));
        $show = $request->string('show')->toString() ?: 'active';

        $suppliers = Supplier::query()
            ->withCount(['purchases', 'purchases as open_purchases_count' => fn (Builder $q) => $q->whereIn('status', Purchase::OPEN)])
            ->when($show === 'active', fn (Builder $q) => $q->where('is_active', true))
            ->when($show === 'inactive', fn (Builder $q) => $q->where('is_active', false))
            ->when($search !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->where('name', 'like', "%{$search}%")
                ->orWhere('country', 'like', "%{$search}%")
                ->orWhere('city', 'like', "%{$search}%")))
            ->orderBy('name')
            ->paginate(30)
            ->withQueryString();

        return Inertia::render('Procurement/Suppliers/Index', [
            'suppliers' => collect($suppliers->items())->map(fn (Supplier $s) => PurchaseOrderPresenter::supplier($s))->values()->all(),
            'filters' => ['search' => $search, 'show' => $show],
            'pagination' => [
                'current_page' => $suppliers->currentPage(),
                'last_page' => $suppliers->lastPage(),
                'total' => $suppliers->total(),
            ],
        ]);
    }

    public function create(): Response
    {
        return Inertia::render('Procurement/Suppliers/Form', [
            'supplier' => null,
            ...$this->options(),
        ]);
    }

    public function store(SaveSupplierRequest $request): RedirectResponse
    {
        $supplier = Supplier::query()->create($request->validated() + ['created_by' => $request->user()->id]);

        return redirect()->route('procurement.suppliers.index')->with('success', "{$supplier->name} added.");
    }

    public function edit(Supplier $supplier): Response
    {
        return Inertia::render('Procurement/Suppliers/Form', [
            'supplier' => PurchaseOrderPresenter::supplier($supplier->loadCount('purchases')),
            ...$this->options(),
        ]);
    }

    public function update(SaveSupplierRequest $request, Supplier $supplier): RedirectResponse
    {
        $supplier->update($request->validated());

        return redirect()->route('procurement.suppliers.index')->with('success', "{$supplier->name} saved.");
    }

    /** Remove a supplier nobody has ordered from; otherwise only deactivate. */
    public function destroy(Supplier $supplier): RedirectResponse
    {
        if ($supplier->purchases()->exists()) {
            $supplier->update(['is_active' => false]);

            return back()->with('success', "{$supplier->name} has orders, so it was deactivated instead of removed.");
        }

        $supplier->delete();

        return redirect()->route('procurement.suppliers.index')->with('success', "{$supplier->name} removed.");
    }

    /** @return array<string, mixed> */
    private function options(): array
    {
        return [
            'currencies' => config('procurement.currencies', []),
            'paymentTerms' => config('procurement.payment_terms', []),
        ];
    }
}
