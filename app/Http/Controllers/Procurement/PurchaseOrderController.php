<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Exceptions\PurchaseOrderException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Procurement\MarkPurchaseOrderedRequest;
use App\Http\Requests\Procurement\PurchaseOrderReasonRequest;
use App\Http\Requests\Procurement\SavePurchaseOrderRequest;
use App\Models\Finance\PaymentAccount;
use App\Models\Inventory\Warehouse;
use App\Models\Item\ItemVariant;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\Supplier;
use App\Models\Procurement\SupplierPayment;
use App\Services\Procurement\PurchaseOrderPresenter;
use App\Services\Procurement\PurchaseOrderService;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Purchase orders: list, raise (with lines), change a draft, and every step
 * of the workflow. Each step goes through PurchaseOrderService.
 */
class PurchaseOrderController extends Controller
{
    public function __construct(private readonly PurchaseOrderService $orders)
    {
    }

    public function index(Request $request): Response
    {
        $status = $request->string('status')->toString() ?: 'all';
        $search = trim((string) $request->string('search'));
        $supplierId = $request->integer('supplier') ?: null;

        $base = fn (): Builder => Purchase::query()
            ->whereNotNull('supplier_id')
            ->when($supplierId !== null, fn (Builder $q) => $q->where('supplier_id', $supplierId))
            ->when($search !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->where('reference_number', 'like', "%{$search}%")
                ->orWhere('supplier_name', 'like', "%{$search}%")
                ->orWhere('notes', 'like', "%{$search}%")));

        $orders = $base()
            ->when($status === 'open', fn (Builder $q) => $q->whereIn('status', Purchase::OPEN))
            ->when(in_array($status, Purchase::STATUSES, true), fn (Builder $q) => $q->where('status', $status))
            ->with(['supplier', 'user'])
            ->withCount('lines')
            ->orderByDesc('id')
            ->paginate(30)
            ->withQueryString();

        $counts = $base()->selectRaw('status, COUNT(*) as total')->groupBy('status')->pluck('total', 'status');

        return Inertia::render('Procurement/PurchaseOrders/Index', [
            'orders' => collect($orders->items())->map(fn (Purchase $p) => PurchaseOrderPresenter::summary($p))->values()->all(),
            'counts' => [
                'all' => (int) $counts->sum(),
                'open' => (int) $counts->only(Purchase::OPEN)->sum(),
                ...collect(Purchase::STATUSES)->mapWithKeys(fn (string $s) => [$s => (int) ($counts[$s] ?? 0)])->all(),
            ],
            'filters' => ['status' => $status, 'search' => $search, 'supplier' => $supplierId],
            'suppliers' => Supplier::query()->orderBy('name')->get(['id', 'name'])->map(fn (Supplier $s) => ['id' => (int) $s->id, 'name' => $s->name])->all(),
            'pagination' => [
                'current_page' => $orders->currentPage(),
                'last_page' => $orders->lastPage(),
                'total' => $orders->total(),
            ],
        ]);
    }

    public function create(Request $request): Response
    {
        return Inertia::render('Procurement/PurchaseOrders/Form', [
            'order' => null,
            'preselectedSupplier' => $request->integer('supplier') ?: null,
            ...$this->formOptions(),
        ]);
    }

    public function store(SavePurchaseOrderRequest $request): RedirectResponse
    {
        return $this->attempt(function () use ($request): RedirectResponse {
            $purchase = $this->orders->create($request->validated(), $request->user());

            return redirect()->route('procurement.purchase_orders.show', $purchase)
                ->with('success', "{$purchase->reference_number} saved as a draft. Submit it when it is ready for approval.");
        });
    }

    public function show(Request $request, Purchase $purchase): Response
    {
        return Inertia::render('Procurement/PurchaseOrders/Show', [
            'order' => PurchaseOrderPresenter::detail($purchase, $request->user()),
            'adminLimit' => PurchaseOrderService::adminLimit(),
            'homeCurrency' => config('procurement.home_currency', 'ETB'),
            'accounts' => PaymentAccount::query()
                ->where('purpose', PaymentAccount::PURPOSE_SETTLEMENT)
                ->where('is_active', true)
                ->orderBy('account_name')
                ->get()
                ->map(fn (PaymentAccount $a) => ['id' => (int) $a->id, 'label' => trim("{$a->account_name} · {$a->account_number}")])
                ->all(),
            'methods' => SupplierPayment::METHODS,
        ]);
    }

    public function edit(Request $request, Purchase $purchase): Response|RedirectResponse
    {
        if (! $purchase->isEditable()) {
            return redirect()->route('procurement.purchase_orders.show', $purchase)
                ->with('error', 'Only a draft can be changed.');
        }

        return Inertia::render('Procurement/PurchaseOrders/Form', [
            'order' => PurchaseOrderPresenter::detail($purchase, $request->user()),
            'preselectedSupplier' => null,
            ...$this->formOptions(),
        ]);
    }

    public function update(SavePurchaseOrderRequest $request, Purchase $purchase): RedirectResponse
    {
        return $this->attempt(function () use ($request, $purchase): RedirectResponse {
            $purchase = $this->orders->update($purchase, $request->validated(), $request->user());

            return redirect()->route('procurement.purchase_orders.show', $purchase)->with('success', "{$purchase->reference_number} saved.");
        });
    }

    public function submit(Request $request, Purchase $purchase): RedirectResponse
    {
        return $this->attempt(function () use ($request, $purchase): RedirectResponse {
            $purchase = $this->orders->submit($purchase, $request->user());
            $who = PurchaseOrderService::needsAdmin($purchase) ? 'a global admin' : 'another procurement user or an admin';

            return back()->with('success', "{$purchase->reference_number} submitted. It now needs {$who} to approve it.");
        });
    }

    public function approve(Request $request, Purchase $purchase): RedirectResponse
    {
        return $this->attempt(function () use ($request, $purchase): RedirectResponse {
            $purchase = $this->orders->approve($purchase, $request->user());

            return back()->with('success', "{$purchase->reference_number} approved. Place it with the supplier, then mark it ordered.");
        });
    }

    public function sendBack(PurchaseOrderReasonRequest $request, Purchase $purchase): RedirectResponse
    {
        return $this->attempt(function () use ($request, $purchase): RedirectResponse {
            $purchase = $this->orders->sendBack($purchase, $request->user(), (string) $request->validated('reason'));

            return back()->with('success', "{$purchase->reference_number} sent back to draft.");
        });
    }

    public function markOrdered(MarkPurchaseOrderedRequest $request, Purchase $purchase): RedirectResponse
    {
        return $this->attempt(function () use ($request, $purchase): RedirectResponse {
            $purchase = $this->orders->markOrdered($purchase, $request->user(), $request->validated('ordered_at'));

            return back()->with('success', "{$purchase->reference_number} is ordered.");
        });
    }

    public function cancel(PurchaseOrderReasonRequest $request, Purchase $purchase): RedirectResponse
    {
        return $this->attempt(function () use ($request, $purchase): RedirectResponse {
            $purchase = $this->orders->cancel($purchase, $request->user(), (string) $request->validated('reason'));

            return back()->with('success', "{$purchase->reference_number} cancelled.");
        });
    }

    public function close(Request $request, Purchase $purchase): RedirectResponse
    {
        return $this->attempt(function () use ($request, $purchase): RedirectResponse {
            $purchase = $this->orders->close($purchase, $request->user());

            return back()->with('success', "{$purchase->reference_number} closed.");
        });
    }

    /** SKUs for the order form's line picker: up to 25 matches. */
    public function variants(Request $request): JsonResponse
    {
        $term = trim((string) $request->string('q'));

        $variants = ItemVariant::query()
            ->with(['item', 'itemColor', 'itemSize', 'itemPackagingType'])
            ->when($term !== '', fn (Builder $q) => $q->where(fn (Builder $w) => $w
                ->where('sku', 'like', "%{$term}%")
                ->orWhere('barcode', 'like', "%{$term}%")
                ->orWhereHas('item', fn (Builder $i) => $i->where('product_name', 'like', "%{$term}%"))))
            ->orderBy('sku')
            ->limit(25)
            ->get();

        return response()->json([
            'variants' => $variants->map(fn (ItemVariant $v) => PurchaseOrderPresenter::variant($v))->values()->all(),
        ]);
    }

    /** @return array<string, mixed> */
    private function formOptions(): array
    {
        return [
            'suppliers' => Supplier::query()->active()->orderBy('name')->get()
                ->map(fn (Supplier $s) => PurchaseOrderPresenter::supplier($s))->all(),
            'warehouses' => Warehouse::query()->orderBy('name')->get(['id', 'name', 'code'])
                ->map(fn (Warehouse $w) => ['id' => (int) $w->id, 'name' => (string) $w->name, 'code' => $w->code])->all(),
            'currencies' => config('procurement.currencies', []),
            'homeCurrency' => config('procurement.home_currency', 'ETB'),
            'paymentTerms' => config('procurement.payment_terms', []),
            'adminLimit' => PurchaseOrderService::adminLimit(),
        ];
    }

    /** Run a workflow step; a refused step comes back as a flash error. */
    private function attempt(Closure $step): RedirectResponse
    {
        try {
            return $step();
        } catch (PurchaseOrderException $e) {
            return back()->with('error', $e->getMessage());
        }
    }
}
