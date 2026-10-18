<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Exceptions\PaymentException;
use App\Http\Controllers\Controller;
use App\Http\Requests\Finance\ExpenseReasonRequest;
use App\Http\Requests\Finance\SaveExpenseRequest;
use App\Models\Finance\Expense;
use App\Models\Fulfillment\Vehicle;
use App\Models\Store\Store;
use App\Services\Documents\DocumentService;
use App\Services\Finance\ExpenseService;
use App\Services\Workforce\LocalTime;
use Closure;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;
use Symfony\Component\HttpFoundation\Response as HttpResponse;

/**
 * Expenses (fuel for staff rides, rent, salaries…): the same page on the
 * finance app and the admin app's global zone. Anyone here records one; a
 * second person (finance or a global admin) confirms it (ExpenseService).
 */
class ExpenseController extends Controller
{
    public function __construct(private readonly ExpenseService $expenses)
    {
    }

    public function index(Request $request): Response
    {
        $app = $this->app($request);
        $user = $request->user();
        $month = LocalTime::today()->startOfMonth();

        return Inertia::render('Finance/Expenses/Index', [
            'app' => $app,
            'waiting' => Expense::query()->where('status', Expense::STATUS_CLAIMED)->oldest('spent_on')->get()
                ->map(fn (Expense $expense): array => $this->expenses->present($expense, $user, $app))->values()->all(),
            'recent' => Expense::query()->whereIn('status', [Expense::STATUS_CONFIRMED, Expense::STATUS_REJECTED])->latest('decided_at')->limit(30)->get()
                ->map(fn (Expense $expense): array => $this->expenses->present($expense, $user, $app))->values()->all(),
            'thisMonth' => $this->expenses->totals($month->toDateString(), $month->endOfMonth()->toDateString()),
            'lastMonth' => $this->expenses->totals($month->subMonth()->toDateString(), $month->subMonth()->endOfMonth()->toDateString()),
            'categories' => Expense::CATEGORIES,
            'stores' => Store::query()->orderBy('name')->get(['id', 'name'])->map(fn (Store $store): array => ['id' => (int) $store->id, 'name' => $store->name])->all(),
            'vehicles' => Vehicle::query()->orderBy('name')->get()->map(fn (Vehicle $car): array => ['id' => (int) $car->id, 'name' => $car->name.' · '.$car->plate])->all(),
            'mayConfirm' => ExpenseService::mayConfirm($user),
        ]);
    }

    public function store(SaveExpenseRequest $request): RedirectResponse
    {
        return $this->attempt(
            fn () => $this->expenses->record($request->user(), $request->safe()->except('receipt'), $request->file('receipt')),
            'Expense recorded. A second person confirms it.',
        );
    }

    public function confirm(Request $request, Expense $expense): RedirectResponse
    {
        return $this->attempt(fn () => $this->expenses->confirm($expense, $request->user()), 'Expense confirmed: it counts.');
    }

    public function reject(ExpenseReasonRequest $request, Expense $expense): RedirectResponse
    {
        return $this->attempt(fn () => $this->expenses->reject($expense, $request->user(), (string) $request->validated('reason')), 'Expense rejected: it does not count.');
    }

    public function receipt(Expense $expense, DocumentService $documents): HttpResponse
    {
        $document = $expense->receipt;
        abort_if($document === null, 404);

        return response($documents->contents($document), 200, [
            'Content-Type' => $document->mime_type,
            'Content-Disposition' => 'inline; filename="'.addcslashes($document->original_name, '"\\').'"',
            'Cache-Control' => 'private, max-age=600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function attempt(Closure $step, string $success): RedirectResponse
    {
        try {
            $step();
        } catch (PaymentException $e) {
            abort_if($e->getCode() === 403, 403, $e->getMessage());

            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', $success);
    }

    private function app(Request $request): string
    {
        return str_starts_with((string) $request->route()?->getName(), 'finance.') ? 'finance' : 'admin';
    }
}
