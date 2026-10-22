<?php

declare(strict_types=1);

namespace App\Services\Guide\Stations;

use App\Models\Auth\User;
use App\Models\Finance\PaymentAccount;
use App\Services\Finance\BalanceLedger;
use App\Services\Finance\PaymentBoard;

/**
 * The Cash & payments desk: payment parts waiting for their second person,
 * and cash handovers waiting for the settlement account's owner. Every money
 * part needs two different people, so the inbox is only what this viewer may
 * confirm (PaymentBoard::awaiting is the same rule the pages use). Seller
 * and admin apps; the routes are each app's own.
 */
class MoneyStations
{
    use BuildsStations;

    public function __construct(private readonly PaymentBoard $board, private readonly BalanceLedger $ledger)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function __invoke(User $viewer, string $app, int $storeId, array $shelving = []): array
    {
        $this->app = $app;

        if (! in_array($app, ['seller', 'admin'], true)) {
            return [];
        }

        $prefix = $app === 'seller' ? 'seller.payments' : 'admin.payments';
        $parts = $this->board->inbox($viewer, $app === 'admin' ? [$storeId] : null);
        $items = [];

        foreach ($parts as $part) {
            $items[] = [
                'id' => 'pay-'.$part['id'],
                'title' => number_format((float) $part['amount'], 2).' ETB · '.strtoupper((string) $part['method']).' · '.$part['order'],
                'subtitle' => (string) ($part['customer'] ?? '').($part['claimed_by'] ? ' · taken by '.$part['claimed_by'] : ''),
                'lines' => array_values(array_filter([$part['account']['label'] ?? null ? 'Into '.$part['account']['label'] : null, $part['reference'] ? 'Reference '.$part['reference'] : null])),
                'chips' => [['label' => 'Check the money, then confirm', 'tone' => 'warning']],
                'actions' => array_values(array_filter([
                    $this->act('confirm', 'The money is here', "{$prefix}.confirm", ['payment' => $part['id']], 'post', [], [], 'success'),
                    $this->act('reject', 'Not received yet', "{$prefix}.reject", ['payment' => $part['id']], 'post', [], [], 'inherit', 'Mark this part as not received yet?'),
                ])),
            ];
        }

        if ($app === 'seller') {
            // The cash this seller holds, to hand over to a settlement account's owner (who confirms it).
            $held = $this->ledger->heldCents((int) $viewer->id) / 100;
            $accounts = PaymentAccount::query()->where('purpose', PaymentAccount::PURPOSE_SETTLEMENT)->where('is_active', true)
                ->where('owner_user_id', '!=', $viewer->id)->whereHas('remitters', fn ($q) => $q->whereKey($viewer->id))->with('owner')->get();

            if ($held > 0 && $accounts->isNotEmpty()) {
                $remit = $this->act('remit', 'Hand it over', 'seller.balance.remit', [], 'post', [], [
                    ['name' => 'to_payment_account_id', 'label' => 'To', 'type' => 'select', 'required' => true, 'default' => (string) $accounts->first()->id,
                        'options' => $accounts->map(fn (PaymentAccount $a): array => ['value' => (string) $a->id, 'label' => (string) $this->board->account($a)['label']])->all()],
                    ['name' => 'amount', 'label' => 'How much', 'type' => 'number', 'default' => $held, 'min' => 0.01, 'required' => true],
                    ['name' => 'reference', 'label' => 'Note (optional)', 'type' => 'text'],
                ], 'primary');

                if ($remit !== null) {
                    $items[] = ['id' => 'balance', 'title' => 'You hold '.number_format($held, 2).' ETB', 'subtitle' => 'Hand it to a settlement account: its owner checks and confirms.', 'chips' => [['label' => 'Balance', 'tone' => 'info']], 'actions' => [$remit]];
                }
            }

            foreach ($this->board->handoverInbox((int) $viewer->id) as $handover) {
                $items[] = [
                    'id' => 'handover-'.$handover['id'],
                    'title' => 'Cash handover · '.number_format((float) $handover['amount'], 2).' ETB',
                    'subtitle' => 'From '.($handover['by'] ?? 'a seller').' into '.($handover['to']['label'] ?? 'your account'),
                    'chips' => [['label' => 'Count the cash', 'tone' => 'warning']],
                    'actions' => array_values(array_filter([
                        $this->act('confirm', 'Cash received', 'seller.handovers.confirm', ['remittance' => $handover['id']], 'post', [], [], 'success'),
                        $this->act('reject', 'Not received', 'seller.handovers.reject', ['remittance' => $handover['id']], 'post', [], [], 'inherit', 'Say this handover did not arrive?'),
                    ])),
                ];
            }
        }

        return [$this->station('payments', 'Payments to confirm', 'desk_cash', $items, [
            'blurb' => 'Every money part needs two different people: whoever took it, and whoever checks it arrived.',
            'empty' => 'Nothing is waiting for you to confirm.',
            'open' => $this->open('Open Payments', $app === 'seller' ? 'seller.payments.inbox' : 'admin.payments.index'),
        ])];
    }
}
