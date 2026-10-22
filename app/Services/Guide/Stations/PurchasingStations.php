<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Procurement\ConsignmentCost;
use App\Models\Procurement\Purchase;
use App\Models\Procurement\SupplierPayment;
use App\Services\Finance\ExpenseService;
use App\Services\Procurement\ConsignmentPresenter;
use App\Services\Procurement\PurchaseOrderPresenter;
use App\Services\Procurement\PurchaseOrderService;

/**
 * The Purchasing desk and the expenses on the Cash desk (admin app, global
 * admin): what procurement and the money people recorded, waiting for a
 * second person: purchase orders to approve, import costs, supplier payments,
 * expenses. Each list is the page's own and carries its own "may this viewer
 * decide" flag.
 */
class PurchasingStations
{
    use BuildsStations;

    public function __construct(private readonly ConsignmentPresenter $costs)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        // Orders are central: only a global admin (no store) works them.
        if ($app !== 'admin' || $viewer->store_id !== null) {
            return [];
        }

        $reason = [['name' => 'reason', 'label' => 'Why', 'type' => 'text', 'required' => true]];

        // Purchase orders submitted for approval.
        $orders = Purchase::query()->where('status', Purchase::STATUS_SUBMITTED)->orderBy('submitted_at')->limit(10)->get()->map(function (Purchase $p) use ($viewer, $reason): array {
            $d = PurchaseOrderPresenter::detail($p, $viewer);
            $refusal = $d['review_refusal'] ?? PurchaseOrderService::reviewRefusal($p, $viewer);

            return [
                'id' => 'po-'.$p->id,
                'title' => (string) $p->reference_number.' · '.($d['supplier'] ?? 'Supplier'),
                'subtitle' => count($d['lines']).' lines',
                'lines' => $refusal !== null ? [(string) $refusal] : [],
                'chips' => [['label' => 'Submitted', 'tone' => 'info']],
                'actions' => $refusal !== null ? [] : array_values(array_filter([
                    $this->act('approve', 'Approve', 'admin.purchase_orders.approve', ['purchase' => $p->id], 'post', [], [], 'success'),
                    $this->act('send_back', 'Send back to draft', 'admin.purchase_orders.send_back', ['purchase' => $p->id], 'post', [], $reason, 'inherit'),
                ])),
            ];
        })->all();

        // Import costs (freight, customs, port fees) waiting for a second person.
        $imports = ConsignmentCost::query()->whereNull('confirmed_at')->whereNull('rejected_at')->with(['consignment', 'recorder'])->orderBy('id')->limit(10)->get()
            ->map(function (ConsignmentCost $c) use ($viewer, $reason): array {
                $x = $this->costs->pendingCost($c, $viewer);

                return [
                    'id' => 'cost-'.$c->id,
                    'title' => (string) $x['label'].' · '.number_format((float) $x['amount'], 2).' '.$x['currency'],
                    'subtitle' => 'Consignment '.$x['consignment']['reference'].' · recorded by '.($x['recorded_by'] ?? ''),
                    'chips' => [['label' => 'Import cost', 'tone' => 'info']],
                    'actions' => $x['can_confirm'] ? array_values(array_filter([
                        $this->act('confirm', 'Confirm the cost', 'admin.import_costs.confirm', ['cost' => $c->id], 'post', [], [], 'success'),
                        $this->act('reject', 'Reject', 'admin.import_costs.reject', ['cost' => $c->id], 'post', [], $reason, 'inherit'),
                    ])) : [],
                ];
            })->all();

        // Supplier payments claimed, waiting to be confirmed.
        $payments = SupplierPayment::query()->where('status', SupplierPayment::STATUS_CLAIMED)
            ->with(['installment', 'claimer', 'account', 'supplierPayable.payable', 'supplierPayable.supplier'])->orderBy('claimed_at')->limit(10)->get()
            ->map(function (SupplierPayment $p) use ($viewer, $reason): array {
                $x = PurchaseOrderPresenter::payment($p, $viewer);

                return [
                    'id' => 'sp-'.$p->id,
                    'title' => number_format((float) $x['amount'], 2).' '.$x['currency'].' · '.($p->supplierPayable?->supplier?->name ?? 'Supplier'),
                    'subtitle' => ($x['installment'] ?? 'Payment').' · claimed by '.($x['claimed_by'] ?? ''),
                    'chips' => [['label' => 'Supplier payment', 'tone' => 'info']],
                    'actions' => $x['can_confirm'] ? array_values(array_filter([
                        $this->act('confirm', 'Confirm the payment', 'admin.supplier_payments.confirm', ['payment' => $p->id], 'post', [], [], 'success'),
                        $this->act('reject', 'Reject', 'admin.supplier_payments.reject', ['payment' => $p->id], 'post', [], $reason, 'inherit'),
                    ])) : [],
                ];
            })->all();

        // Expenses (fuel, rent, salaries) a second person confirms.
        $expenses = Expense::query()->where('status', Expense::STATUS_CLAIMED)->oldest('spent_on')->limit(10)->get()->map(function (Expense $e) use ($viewer, $reason): array {
            $x = app(ExpenseService::class)->present($e, $viewer, 'admin');

            return [
                'id' => 'exp-'.$e->id,
                'title' => ucfirst((string) $x['category']).' · '.number_format((float) $x['amount'], 2).' '.$x['currency'],
                'subtitle' => ($x['description'] ?: 'No description').' · '.($x['recorded_by'] ?? ''),
                'chips' => [['label' => 'Expense', 'tone' => 'info']],
                'actions' => $x['can_decide'] ? array_values(array_filter([
                    $this->act('confirm', 'It counts', 'admin.expenses.confirm', ['expense' => $e->id], 'post', [], [], 'success'),
                    $this->act('reject', 'Reject', 'admin.expenses.reject', ['expense' => $e->id], 'post', [], $reason, 'inherit'),
                ])) : [],
            ];
        })->all();

        return [
            $this->station('purchase_orders', 'Purchase orders', 'desk_purchasing', [...$orders, ...$imports, ...$payments], [
                'blurb' => 'Orders submitted for approval, import costs and supplier payments waiting for their second person.',
                'empty' => 'Nothing is waiting for a decision.',
                'open' => $this->open('Open Purchase Orders', 'admin.purchase_orders.index'),
            ]),
            $this->station('expenses', 'Expenses', 'desk_cash', $expenses, [
                'blurb' => 'Fuel for staff rides, rent, salaries: a second person confirms each.',
                'empty' => 'No expense is waiting.',
                'open' => $this->open('Open Expenses', 'admin.expenses.index'),
            ]),
        ];
    }
}
