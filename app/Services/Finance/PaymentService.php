<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Exceptions\InsufficientStockException;
use App\Exceptions\PaymentException;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Payment;
use App\Models\Finance\PaymentAccount;
use App\Models\Finance\Sale;
use App\Models\Finance\SaleItem;
use App\Models\Inventory\StockReservation;
use App\Services\Admin\ActiveStore;
use App\Services\Inventory\StockPools;
use App\Services\StockService;
use App\Services\Workforce\LocalTime;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The only place a payment's status changes.
 *
 *   setParts      the seller splits the order total across collection
 *                 accounts, cash and the customer's credit. Account parts
 *                 start pending; cash starts claimed by the seller taking
 *                 it and waits on a store manager or admin; credit is
 *                 confirmed on the spot, within the limit an admin set. The
 *                 parts must add up to the total.
 *   setRepayment  a customer pays back credit, split the same way (no
 *                 credit). It reduces what they owe once confirmed.
 *   claim         the customer says they paid a part: it waits on the
 *                 account's owner, and the order's stock stops lapsing.
 *   confirm       a second person saw the money arrive. The account's owner
 *                 may confirm a deposit before anyone marks it paid, as
 *                 long as they did not record the part themselves.
 *   reject        "not received yet": the part goes back to pending.
 *   voidOpen      the order was cancelled; parts whose money never arrived,
 *                 and any credit it used, are voided.
 *
 * Two people stand behind every money part: whoever marks it paid (claims
 * it) cannot also confirm it. Cash is claimed by the seller who took it and
 * confirmed by a store manager or admin of the store; an account part is
 * confirmed by the account's owner, or, when the owner claimed it themselves,
 * by a store manager or admin. Credit needs no second person: an admin
 * already set it.
 *
 * Once every live part is confirmed the order moves to Pick & Pack. Until it
 * is handed to delivery its payment may still change (a credit part swapped
 * for cash, say); it then waits in Pick & pack for that money, and cannot
 * leave until it is in (OrderSourcingService::confirmSourcing). Each step
 * locks the sale row (or, for a repayment, the customer), so two
 * confirmations cannot both advance it. Money that is confirmed lands on the
 * confirmer's balance (BalanceLedger); credit is not money and does not.
 */
class PaymentService
{
    public function __construct(
        private readonly StockService $stock,
        private readonly BalanceLedger $ledger,
        private readonly CustomerCreditService $credit,
    ) {
    }

    /**
     * Replace how the order is paid: its pending parts and any credit it used
     * give way to $parts.
     *
     * Money someone already marked paid or confirmed is kept; together with
     * the new parts it must equal the order total. No parts at all is "pay
     * later". This works in To pay and, until the order is handed to
     * delivery, in Pick & pack: a customer may swap credit for cash while the
     * order is being picked, and the order then waits for that money before
     * it can leave (OrderSourcingService::confirmSourcing).
     *
     * @param  array<int, array{payment_account_id?: int|null, amount: float|int|string, transaction_reference?: string|null}>  $parts
     *
     * @throws PaymentException
     */
    public function setParts(Sale $sale, array $parts, User $by): Sale
    {
        return DB::transaction(function () use ($sale, $parts, $by): Sale {
            $sale = $this->lockPayable($sale);

            $kept = $sale->payments()
                ->whereIn('status', [Payment::STATUS_CLAIMED, Payment::STATUS_CONFIRMED])
                ->where('payment_method', '!=', Payment::METHOD_CREDIT)
                ->get();
            $keptCents = $this->cents($kept->sum('amount'));
            $newCents = array_sum(array_map(fn (array $part): int => $this->cents($part['amount']), $parts));
            $totalCents = $this->cents($sale->total_amount);

            if ($parts === [] && $kept->isEmpty()) {
                $this->dropReplaceable($sale);

                return $this->settle($sale, $by);
            }

            if ($keptCents + $newCents !== $totalCents) {
                throw new PaymentException(sprintf(
                    'The payment parts add up to %s ETB but the order total is %s ETB.',
                    number_format(($keptCents + $newCents) / 100, 2),
                    number_format($totalCents / 100, 2),
                ));
            }

            $accounts = $this->collectionAccounts((int) $sale->store_id, $parts);
            $creditCents = $this->creditCents($parts);

            // The old credit is given back before the limit is checked, so
            // re-splitting an order does not count its credit twice.
            $this->dropReplaceable($sale);

            if ($creditCents > 0) {
                $this->guardCredit($sale, $creditCents);
            }

            foreach ($parts as $part) {
                $this->createPart(['sale_id' => $sale->id], $part, $accounts, $by);
            }

            if ($creditCents > 0) {
                // A credit order is the admin's trust in the customer: its
                // stock is held from now, and it is due in credit_days.
                $this->keepHolds($sale, $by);
                $sale->update(['due_date' => LocalTime::today()->addDays((int) $sale->customer->credit_days)->toDateString()]);
            }

            return $this->settle($sale, $by);
        });
    }

    /**
     * A customer paying back credit, split across the seller's store's
     * accounts and cash. It may not be more than they owe, less repayments
     * still waiting on an owner.
     *
     * @param  array<int, array{payment_account_id?: int|null, method?: string|null, amount: float|int|string, transaction_reference?: string|null}>  $parts
     *
     * @throws PaymentException
     */
    public function setRepayment(Customer $customer, array $parts, User $by): void
    {
        DB::transaction(function () use ($customer, $parts, $by): void {
            Customer::query()->whereKey($customer->id)->lockForUpdate()->first();

            if ($parts === [] || $this->creditCents($parts) > 0) {
                throw new PaymentException('Credit is paid back by account or cash.');
            }

            $waiting = $this->cents(Payment::query()
                ->where('kind', Payment::KIND_REPAYMENT)
                ->where('customer_id', $customer->id)
                ->whereIn('status', [Payment::STATUS_PENDING, Payment::STATUS_CLAIMED])
                ->sum('amount'));
            $owed = $this->credit->outstandingCents((int) $customer->id) - $waiting;
            $paying = array_sum(array_map(fn (array $part): int => $this->cents($part['amount']), $parts));

            if ($paying > $owed) {
                throw new PaymentException(sprintf(
                    'The customer owes %s ETB not already on its way; this repayment is %s ETB.',
                    number_format(max(0, $owed) / 100, 2),
                    number_format($paying / 100, 2),
                ));
            }

            $accounts = $this->collectionAccounts((int) $by->store_id, $parts);

            foreach ($parts as $part) {
                $this->createPart([
                    'kind' => Payment::KIND_REPAYMENT,
                    'customer_id' => $customer->id,
                ], $part, $accounts, $by);
            }
        });
    }

    /**
     * Drop a repayment part the customer never paid.
     *
     * @throws PaymentException
     */
    public function voidRepayment(Payment $payment): void
    {
        DB::transaction(function () use ($payment): void {
            $payment = $this->fresh($payment);

            if (! $payment->isRepayment() || $payment->status !== Payment::STATUS_PENDING) {
                throw new PaymentException('Only a repayment still waiting for the customer can be removed.');
            }

            $payment->update(['status' => Payment::STATUS_VOID]);
        });
    }

    /**
     * The customer says they paid this part. It now waits on the owner, and
     * the order's stock no longer lapses.
     *
     * @throws PaymentException
     * @throws InsufficientStockException when a lapsed hold cannot be renewed
     */
    public function claim(Payment $payment, User $by): Payment
    {
        return $this->markClaimed($payment, $by, $by);
    }

    /**
     * The customer, on a shared cart link, says they sent this transfer.
     * Nobody is named as claimer (a customer has no login), so whoever owns
     * the account, or the store's manager, confirms it as with any claim;
     * the customer can never be the second person. Stock holds are booked to
     * $seller, the cart's seller.
     *
     * @throws PaymentException
     */
    public function claimByCustomer(Payment $payment, User $seller, ?string $reference = null): Payment
    {
        if ($payment->payment_account_id === null) {
            throw new PaymentException('Only a bank or wallet transfer can be marked as sent here.');
        }

        return $this->markClaimed($payment, null, $seller, $reference);
    }

    private function markClaimed(Payment $payment, ?User $claimer, User $holdsBy, ?string $reference = null): Payment
    {
        return DB::transaction(function () use ($payment, $claimer, $holdsBy, $reference): Payment {
            $sale = $this->lockFor($payment);
            $payment = $this->fresh($payment);

            $claimable = $payment->payment_account_id !== null || $payment->payment_method === Payment::METHOD_CASH;

            if ($payment->status !== Payment::STATUS_PENDING || ! $claimable) {
                throw new PaymentException('Only a payment still waiting for the customer can be marked as paid.');
            }

            if ($sale !== null) {
                $this->keepHolds($sale, $holdsBy);
            }

            $payment->update(array_filter([
                'status' => Payment::STATUS_CLAIMED,
                'claimed_at' => now(),
                'claimed_by' => $claimer?->id,
                'claimed_via' => $claimer === null ? Payment::CLAIMED_VIA_CUSTOMER : null,
                'transaction_reference' => $reference !== null && $reference !== '' ? $reference : null,
            ], fn ($value) => $value !== null) + ['claimed_by' => $claimer?->id]);

            return $payment;
        });
    }

    /**
     * The owner saw the money in their account.
     *
     * @throws PaymentException
     */
    public function confirm(Payment $payment, User $by): Payment
    {
        return DB::transaction(function () use ($payment, $by): Payment {
            $sale = $this->lockFor($payment);
            $early = self::mayConfirmEarly($this->fresh($payment), $by);
            $payment = $early ? $this->fresh($payment) : $this->claimedFor($payment, $by);

            // Confirmed before anyone said "customer paid": the money is in,
            // so the order's stock stops lapsing just as a claim would.
            if ($early && $sale !== null) {
                $this->keepHolds($sale, $by);
            }

            $payment->update([
                'status' => Payment::STATUS_CONFIRMED,
                'paid_at' => now(),
                'confirmed_at' => now(),
                'confirmed_by' => $by->id,
            ]);

            // The money is in the owner's account, so on the owner's balance.
            // A repayment lowers what the customer owes by being confirmed.
            $this->ledger->recordPayment($payment);

            if ($sale !== null) {
                $this->settle($sale, $by);
            }

            return $payment;
        });
    }

    /**
     * "Not received yet": the part goes back to pending, and the seller sees
     * that the owner could not find the money.
     *
     * @throws PaymentException
     */
    public function reject(Payment $payment, User $by): Payment
    {
        return DB::transaction(function () use ($payment, $by): Payment {
            $this->lockFor($payment);
            $payment = $this->claimedFor($payment, $by);

            $payment->update([
                'status' => Payment::STATUS_PENDING,
                'claimed_at' => null,
                'claimed_by' => null,
                'rejected_at' => now(),
                'rejected_by' => $by->id,
            ]);

            return $payment;
        });
    }

    /**
     * The order was cancelled: parts whose money never arrived are voided,
     * and so is any credit it used, so the customer no longer owes it.
     */
    public function voidOpen(Sale $sale): void
    {
        $sale->payments()
            ->where(fn ($q) => $q->whereIn('status', [Payment::STATUS_PENDING, Payment::STATUS_CLAIMED])
                ->orWhere('payment_method', Payment::METHOD_CREDIT))
            ->update(['status' => Payment::STATUS_VOID]);
    }

    /** Pending parts are deleted and credit voided: what a new split replaces. */
    private function dropReplaceable(Sale $sale): void
    {
        $sale->payments()->where('status', Payment::STATUS_PENDING)->delete();
        $sale->payments()
            ->where('payment_method', Payment::METHOD_CREDIT)
            ->where('status', '!=', Payment::STATUS_VOID)
            ->update(['status' => Payment::STATUS_VOID]);
    }

    /**
     * Move the order on once its money is in: every live part confirmed and
     * adding up to the total. An order already in Pick & pack stays there
     * either way; only its payment status follows the money.
     */
    private function settle(Sale $sale, User $by): Sale
    {
        $confirmedCents = $this->cents($sale->payments()->confirmed()->sum('amount'));
        $totalCents = $this->cents($sale->total_amount);

        if ($totalCents > 0 && $confirmedCents >= $totalCents) {
            $this->keepHolds($sale, $by);

            $sale->update([
                'payment_status' => 'paid',
                'fulfillment_stage' => Sale::STAGE_PICK_PACK,
            ]);
        } else {
            $sale->update(['payment_status' => $confirmedCents > 0 ? 'partially_paid' : 'unpaid']);
        }

        return $sale->refresh();
    }

    /**
     * An order someone has paid towards must not lose its stock. Stop each
     * hold lapsing; renew one that already lapsed, or refuse if the stock has
     * since gone to someone else.
     *
     * @throws InsufficientStockException
     */
    private function keepHolds(Sale $sale, User $by): void
    {
        $sale->loadMissing(['items.storeVariant', 'customer']);

        foreach ($sale->items as $item) {
            /** @var SaleItem $item */
            $open = StockReservation::query()->open()->where('sale_item_id', $item->id)->pluck('id');

            if ($open->isNotEmpty()) {
                StockReservation::query()->whereKey($open)->update(['expires_at' => null]);

                continue;
            }

            $this->stock->reserve((int) ($item->storeVariant?->item_variant_id ?? 0), (int) $sale->store_id, (int) $item->quantity, [
                'sale_item_id' => $item->id,
                'user_id' => $by->id,
                'reason' => 'Renewed on payment '.$sale->reference_number,
                'pool' => StockPools::forCustomer($sale->customer),
            ]);
        }
    }

    /**
     * One part: credit and cash are confirmed on the spot (cash onto the
     * seller's balance), an account part waits for the customer.
     *
     * @param  array<string, mixed>  $owner  sale_id, or kind + customer_id for a repayment
     * @param  array<string, mixed>  $part
     * @param  Collection<int, PaymentAccount>  $accounts
     *
     * @throws PaymentException
     */
    private function createPart(array $owner, array $part, Collection $accounts, User $by): Payment
    {
        $amount = $this->cents($part['amount']) / 100;

        if ($amount <= 0) {
            throw new PaymentException('Every payment part needs an amount above zero.');
        }

        $base = $owner + [
            'amount' => $amount,
            'currency' => 'ETB',
            'transaction_reference' => $part['transaction_reference'] ?? null,
            'user_id' => $by->id,
        ];

        if (($part['method'] ?? null) === Payment::METHOD_CREDIT) {
            return Payment::create($base + [
                'payment_method' => Payment::METHOD_CREDIT,
                'status' => Payment::STATUS_CONFIRMED,
                'confirmed_at' => now(),
                'confirmed_by' => $by->id,
            ]);
        }

        $account = isset($part['payment_account_id']) ? $accounts->get((int) $part['payment_account_id']) : null;

        if ($account === null) {
            // Cash is in the seller's hand, so it starts claimed by them. A
            // store manager or admin confirms it; only then does it count,
            // and it lands on the balance of the seller who took it.
            return Payment::create($base + [
                'payment_method' => Payment::METHOD_CASH,
                'status' => Payment::STATUS_CLAIMED,
                'claimed_at' => now(),
                'claimed_by' => $by->id,
            ]);
        }

        return Payment::create($base + [
            'payment_method' => $account->type,
            'payment_account_id' => $account->id,
            'status' => Payment::STATUS_PENDING,
        ]);
    }

    /** @param array<int, array<string, mixed>> $parts */
    private function creditCents(array $parts): int
    {
        return array_sum(array_map(
            fn (array $part): int => ($part['method'] ?? null) === Payment::METHOD_CREDIT ? $this->cents($part['amount']) : 0,
            $parts,
        ));
    }

    /**
     * The order's customer may take this much more credit: an admin gave
     * them credit, nothing is overdue (or an admin let them off), and it fits
     * in what is left of the limit.
     *
     * @throws PaymentException
     */
    private function guardCredit(Sale $sale, int $creditCents): void
    {
        $customer = $sale->customer_id === null ? null
            : Customer::query()->whereKey($sale->customer_id)->lockForUpdate()->first();

        if ($customer === null || ! $customer->hasCredit()) {
            throw new PaymentException('This customer cannot buy on credit.');
        }

        if ($this->credit->isBlocked($customer)) {
            throw new PaymentException('This customer has an overdue credit invoice. They need to pay it before buying on credit again.');
        }

        // Credit already on this order is kept by a re-split, so it is
        // already counted in what the customer owes.
        $available = $this->credit->availableCents($customer);

        if ($creditCents > $available) {
            throw new PaymentException(sprintf('Only %s ETB of credit is available for this customer.', number_format($available / 100, 2)));
        }

        $sale->setRelation('customer', $customer);
    }

    /**
     * The accounts named by $parts, each an active collection account at the
     * store.
     *
     * @param  array<int, array<string, mixed>>  $parts
     * @return Collection<int, PaymentAccount>
     *
     * @throws PaymentException
     */
    private function collectionAccounts(int $storeId, array $parts): Collection
    {
        $ids = collect($parts)
            ->reject(fn (array $part): bool => ($part['method'] ?? null) === Payment::METHOD_CREDIT)
            ->pluck('payment_account_id')->filter()->map(fn ($id): int => (int) $id)->unique();

        $accounts = PaymentAccount::query()
            ->collectingFor($storeId)
            ->whereKey($ids)
            ->get()
            ->keyBy('id');

        if ($accounts->count() !== $ids->count()) {
            throw new PaymentException('One of the chosen accounts is not an active account for this store.');
        }

        return $accounts;
    }

    /**
     * Lock what a part belongs to: its order, which must still be waiting for
     * payment, or for a repayment its customer (no order to return).
     *
     * @throws PaymentException
     */
    private function lockFor(Payment $payment): ?Sale
    {
        if ($payment->isRepayment()) {
            Customer::query()->whereKey($payment->customer_id)->lockForUpdate()->first();

            return null;
        }

        return $this->lockPayable($payment->sale);
    }

    /**
     * Lock an order whose payment may still change: in To pay, or in Pick &
     * pack before it is handed to delivery.
     *
     * @throws PaymentException
     */
    private function lockPayable(?Sale $sale): Sale
    {
        if ($sale === null) {
            throw new PaymentException('This payment does not belong to an order.');
        }

        $locked = Sale::query()->whereKey($sale->id)->lockForUpdate()->first();

        if ($locked === null || ! in_array($locked->fulfillment_stage, [Sale::STAGE_AWAITING_PAYMENT, Sale::STAGE_PICK_PACK], true)) {
            throw new PaymentException("Order {$sale->reference_number} has left Pick & pack; its payment can no longer change.");
        }

        return $locked;
    }

    /**
     * A claimed part, checked by a second person: never the one who claimed
     * it. An account part is the owner's to confirm (a store manager or admin
     * stands in when the owner claimed it themselves); cash is a store
     * manager's or admin's.
     *
     * @throws PaymentException
     */
    private function claimedFor(Payment $payment, User $by): Payment
    {
        $payment = $this->fresh($payment);

        if (! self::mayConfirm($payment, $by)) {
            if ((int) $payment->claimed_by === (int) $by->id) {
                throw new PaymentException('You marked this payment as paid yourself. A second person has to confirm it.', 403);
            }

            throw new PaymentException($payment->payment_account_id !== null
                ? 'Only the owner of this account can confirm what arrived in it.'
                : 'Only a store manager or admin can confirm cash a seller took.', 403);
        }

        if ($payment->status !== Payment::STATUS_CLAIMED) {
            throw new PaymentException('This payment is not waiting for you to check it.');
        }

        return $payment;
    }

    /**
     * The account's owner saw the deposit arrive before anyone marked it
     * paid. Still two people: whoever recorded the part (its user_id) is
     * never the one who confirms it early.
     */
    public static function mayConfirmEarly(Payment $payment, User $by): bool
    {
        $payment->loadMissing('account');

        return $payment->status === Payment::STATUS_PENDING
            && $payment->payment_account_id !== null
            && (int) ($payment->account?->owner_user_id ?? 0) === (int) $by->id
            && (int) $payment->user_id !== (int) $by->id;
    }

    /** May $by be the second person on this part? */
    public static function mayConfirm(Payment $payment, User $by): bool
    {
        $payment->loadMissing(['account', 'sale']);

        if ((int) $payment->claimed_by === (int) $by->id) {
            return false;
        }

        $ownerId = (int) ($payment->account?->owner_user_id ?? 0);

        if ($payment->payment_account_id !== null && $ownerId === (int) $by->id) {
            return true;
        }

        // Cash, or an account part its own owner claimed: the store's manager.
        $standIn = $payment->payment_account_id === null || $ownerId === (int) $payment->claimed_by;

        return $standIn && self::managesStore($by, self::storeOf($payment));
    }

    /** A store manager or admin of $storeId (a global admin of any store). */
    public static function managesStore(User $user, ?int $storeId): bool
    {
        if (! $user->isRole('admin', 'store_manager')) {
            return false;
        }

        $ids = ActiveStore::accessibleIdsFor($user);

        return $ids === null || ($storeId !== null && in_array($storeId, $ids, true));
    }

    /** The store a part was taken at. */
    public static function storeOf(Payment $payment): ?int
    {
        $storeId = $payment->sale?->store_id
            ?? $payment->account?->store_id
            ?? $payment->claimer?->store_id
            ?? $payment->user?->store_id;

        return $storeId !== null ? (int) $storeId : null;
    }

    private function fresh(Payment $payment): Payment
    {
        return Payment::query()->with('account')->lockForUpdate()->findOrFail($payment->id);
    }

    private function cents(mixed $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }
}
