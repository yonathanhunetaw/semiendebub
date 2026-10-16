<?php

declare(strict_types=1);

namespace App\Http\Controllers\Procurement;

use App\Http\Controllers\Controller;
use App\Models\Procurement\Supplier;
use App\Services\Procurement\PayablesLedger;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Everything still owed to suppliers: overdue, due this week, later, and what
 * waits on an event (shipping, arrival) to get a date.
 */
class PayablesController extends Controller
{
    public function index(Request $request, PayablesLedger $ledger): Response
    {
        $supplierId = $request->integer('supplier') ?: null;
        $rows = $ledger->openInstallments($supplierId);

        return Inertia::render('Procurement/Payables/Index', [
            'installments' => $rows->all(),
            'totals' => $ledger->totals(),
            'bySupplier' => $rows->groupBy('supplier_id')->map(fn ($group) => [
                'supplier_id' => $group->first()['supplier_id'],
                'supplier' => $group->first()['supplier'],
                'owed_etb' => round((float) $group->sum('remaining_etb_estimate'), 2),
                'overdue_etb' => round((float) $group->where('state', 'overdue')->sum('remaining_etb_estimate'), 2),
            ])->sortByDesc('owed_etb')->values()->all(),
            'filters' => ['supplier' => $supplierId],
            'suppliers' => Supplier::query()->orderBy('name')->get(['id', 'name'])->map(fn (Supplier $s) => ['id' => (int) $s->id, 'name' => $s->name])->all(),
            'dueSoonDays' => PayablesLedger::DUE_SOON_DAYS,
        ]);
    }
}
