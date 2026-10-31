<?php

declare(strict_types=1);

namespace App\Services\Dev\Sim;

use App\Exceptions\PaymentException;
use App\Models\Auth\Customer;
use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Finance\Payment;
use App\Models\Finance\Remittance;
use App\Models\Finance\Sale;
use App\Models\Fulfillment\Delivery;
use App\Models\Fulfillment\Shipment;
use App\Models\Inventory\Stocktake;
use App\Models\Item\ItemVariant;
use App\Models\Seller\Cart;
use App\Models\StockKeeper\ItemStock;
use App\Models\Workforce\Shift;
use App\Models\Workforce\SiteDay;
use App\Services\CartService;
use App\Services\DeliveryService;
use App\Services\Finance\BalanceLedger;
use App\Services\Finance\CustomerCreditService;
use App\Services\Finance\DayCash;
use App\Services\Finance\ExpenseService;
use App\Services\Finance\PaymentService;
use App\Services\Finance\RemittanceService;
use App\Services\Fulfillment\OrderSourcingService;
use App\Services\Fulfillment\SellerOrderService;
use App\Services\Fulfillment\ShipmentHandoffService;
use App\Services\Inventory\ReceivingService;
use App\Services\Inventory\StocktakeService;
use App\Services\ShipmentWorkflowService;
use App\Services\StockService;
use App\Services\Workforce\AttendanceService;
use App\Services\Workforce\CounterQr;
use App\Services\Workforce\KeyCustodyService;
use App\Services\Workforce\LeaveService;
use App\Services\Workforce\LocalTime;
use App\Services\Workforce\OvertimeService;
use App\Services\Workforce\RotaService;
use App\Services\Workforce\SiteDayService;
use App\Services\Workforce\Sites;
use App\Services\Workforce\StaffRideService;
use App\Services\Workforce\SwapService;
use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * Performs one event of the script (SimDayScript) through the same service
 * a person's tap would reach, as that person. Nothing here writes a status
 * itself: a step the app refuses throws, and SimRunner reports it.
 *
 * Throwing SimExpected means a refusal the script set out to cause.
 */
final class SimActions
{
    /** @var array<string, int> script ref => the record it made */
    public array $refs = [];

    /** A refusal the last step met on purpose and worked around (SimRunner reports it). */
    public ?string $expected = null;

    public function __construct(
        private readonly SimCast $cast,
        private readonly CartService $carts,
        private readonly SellerOrderService $orders,
        private readonly PaymentService $payments,
        private readonly OrderSourcingService $sourcing,
        private readonly DeliveryService $deliveries,
        private readonly ShipmentWorkflowService $shipments,
        private readonly ShipmentHandoffService $handoff,
        private readonly ReceivingService $receiving,
        private readonly StockService $stock,
        private readonly StocktakeService $stocktakes,
        private readonly SiteDayService $days,
        private readonly AttendanceService $attendance,
        private readonly KeyCustodyService $keys,
        private readonly CounterQr $qr,
        private readonly RotaService $rota,
        private readonly SwapService $swaps,
        private readonly LeaveService $leave,
        private readonly OvertimeService $overtime,
        private readonly StaffRideService $rides,
        private readonly ExpenseService $expenses,
        private readonly RemittanceService $remittances,
        private readonly BalanceLedger $ledger,
        private readonly CustomerCreditService $credit,
        private readonly DayCash $dayCash,
        private readonly Sites $sites,
    ) {
    }

    /**
     * @param  array<string, mixed>  $event
     * @return string|null what was done, for the live log
     */
    public function run(array $event, User $as): ?string
    {
        $args = $event['args'];
        $this->expected = null;
        $method = lcfirst(str_replace('_', '', ucwords((string) $event['kind'], '_')));

        if (! method_exists($this, $method)) {
            throw new RuntimeException("The script has no step [{$event['kind']}].");
        }

        $done = $this->{$method}($args, $as);

        if (is_int($done) && $event['ref'] !== null) {
            $this->refs[$event['ref']] = $done;
        }

        return is_string($done) ? $done : null;
    }

    /*
    |--------------------------------------------------------------------------
    | Staffing
    |--------------------------------------------------------------------------
    */

    /** The manager writes and publishes the week's shifts and the opener/closer/driver plan. */
    private function rota(array $args, User $manager): string
    {
        $site = $this->cast->site;
        $made = 0;

        foreach ($args['plans'] as $date => $plan) {
            [$opens, $closes] = $this->hours($date);
            // The long day: the closer comes in at nine and stays an hour and a half after closing.
            $long = ! empty($plan['overtime']);
            $shifts = [
                $plan['opener'] => [LocalTime::at($date, $opens)->subMinutes(15), LocalTime::at($date, '14:00')],
                $plan['closer'] => [LocalTime::at($date, $long ? '09:00' : '11:00'), LocalTime::at($date, $closes)->addMinutes($long ? 90 : 15)],
                $plan['middle'] => [LocalTime::at($date, '09:00'), LocalTime::at($date, '17:00')],
                'keeper' => [LocalTime::at($date, $opens)->subMinutes(10), LocalTime::at($date, $closes)],
                'manager' => [LocalTime::at($date, $opens), LocalTime::at($date, $closes)],
            ];

            foreach ($shifts as $who => [$starts, $ends]) {
                $person = $this->cast->person($who);
                $exists = Shift::query()->where('stock_location_id', $site->id)->where('user_id', $person->id)
                    ->where('starts_at', $starts->utc())->exists();

                if (! $exists) {
                    $this->rota->save($site, $manager, [
                        'user_id' => $person->id,
                        'starts_at' => LocalTime::wall($starts),
                        'ends_at' => LocalTime::wall($ends),
                    ]);
                    $made++;
                }
            }

            $this->days->plan($site, CarbonImmutable::parse($date), $manager,
                $this->cast->person($plan['opener'])->id, $this->cast->person($plan['closer'])->id, $this->cast->person($plan['driver'])->id);
        }

        $dates = array_keys($args['plans']);
        $this->rota->publish($site, $manager, CarbonImmutable::parse(reset($dates)), CarbonImmutable::parse(end($dates)));

        // Everyone accepts their shifts.
        $people = collect($this->cast->people)->keyBy('id');
        Shift::query()->where('stock_location_id', $site->id)->where('status', Shift::STATUS_PUBLISHED)
            ->whereIn('user_id', $people->keys())->get()
            ->each(fn (Shift $shift) => $this->rota->accept($shift, $people[(int) $shift->user_id]));

        return "Rota: {$made} shifts published for ".count($dates).' days';
    }

    /** The manager records a seller off sick today; their shift is cancelled. */
    private function leave(array $args, User $manager): string
    {
        $person = $this->cast->person($args['person']);
        $this->leave->record($manager, $person, 'sick', CarbonImmutable::parse($args['date']), CarbonImmutable::parse($args['date']), 'Called in sick (sim)');

        return "{$person->first_name} is off sick";
    }

    /** A seller gives tomorrow's shift to a colleague who is off; the colleague takes it, the manager approves. */
    private function swap(array $args, User $manager): string
    {
        $from = $this->cast->person($args['from']);
        $to = $this->cast->person($args['to']);
        $shift = Shift::query()->where('user_id', $from->id)
            ->whereBetween('starts_at', [LocalTime::startOf($args['date']), LocalTime::startOf($args['date'])->addDay()])
            ->firstOrFail();

        $swap = $this->swaps->offer($shift, $from, $to, 'Family visit, can you take it?');
        $swap = $this->swaps->take($swap, $to);
        $this->swaps->approve($swap, $manager);

        return "{$from->first_name} swapped tomorrow's shift to {$to->first_name}";
    }

    /** The closer worked a long day: the manager approves the overtime. */
    private function overtime(array $args, User $manager): string
    {
        $person = $this->cast->person($args['person']);
        $this->overtime->approve($manager, $person, $args['date'], 'Long day: in at nine, stayed after closing');

        return "Overtime approved for {$person->first_name}";
    }

    /*
    |--------------------------------------------------------------------------
    | Keys, opening, attendance, closing
    |--------------------------------------------------------------------------
    */

    /** The van key goes to today's driver: from whoever has it, or handed out by the admin the first time. */
    private function vanKey(array $args, User $admin): string
    {
        return $this->passKey($this->keys->keyFor($this->cast->van), $this->cast->person($args['to']), $admin, 'trip');
    }

    /** The shop key goes to the opener in the morning, or to the closer at the shift change. */
    private function shopKey(array $args, User $as): string
    {
        return $this->passKey($this->keys->keyFor($this->cast->site), $this->cast->person($args['to']), $this->cast->person('manager'), $args['reason'] ?? 'opening');
    }

    private function passKey(\App\Models\Workforce\CustodyKey $key, User $to, User $manager, string $reason): string
    {
        $key->refresh();
        $holder = $key->holder_id === null ? null : User::query()->find($key->holder_id);

        if ($holder !== null && (int) $holder->id === (int) $to->id) {
            return "{$to->first_name} already holds the {$key->label()}";
        }

        if ($holder === null) {
            // Nobody holds it yet: the manager hands it out (a forced hand-over, with a note).
            $this->keys->force($key, $manager, $to, 'Sim: the key is given out the first time');

            return "{$manager->first_name} gave the {$key->label()} to {$to->first_name}";
        }

        $handover = $this->keys->handOver($key, $holder, $to, $reason);
        $this->keys->accept($handover, $to);

        return "{$holder->first_name} → {$to->first_name}: {$key->label()}";
    }

    /** The opener counts the till as the float: what the closer left in it last night (the first day, the float given). */
    private function openDay(array $args, User $opener): string
    {
        $site = $this->cast->site;
        $lastNight = SiteDay::query()->where('stock_location_id', $site->id)->where('status', SiteDay::STATUS_CLOSED)
            ->whereNotNull('till_count')->orderByDesc('closed_at')->value('till_count');
        $float = $lastNight !== null && (float) $lastNight > 0 ? (float) $lastNight : (float) $args['float'];

        $this->days->open($site, $opener, $this->qr->liveToken($site), $this->qr->settings($site)->openingItems(), $float);

        return sprintf('%s opened %s with %s birr in the till%s', $opener->first_name, $site->name, number_format($float), $args['late'] ? ' (late)' : '');
    }

    private function clockIn(array $args, User $user): string
    {
        $this->attendance->clockIn($user, $this->cast->site, $this->qr->liveToken($this->cast->site));

        return "{$user->first_name} clocked in";
    }

    private function clockOut(array $args, User $user): string
    {
        $this->attendance->clockOut($user, $this->cast->site, $this->qr->liveToken($this->cast->site));

        return "{$user->first_name} clocked out";
    }

    private function breakStart(array $args, User $user): string
    {
        $this->attendance->startBreak($user);

        return "{$user->first_name} on lunch";
    }

    private function breakEnd(array $args, User $user): string
    {
        $this->attendance->endBreak($user);

        return "{$user->first_name} back from lunch";
    }

    /** The scheduler's check for openings not done in time (sites:sweep). */
    private function sweep(array $args, User $as): string
    {
        return 'Late openings marked: '.$this->days->sweep(now());
    }

    /** The closer counts the till (short by $args['short'] on one day, with a reason) and closes; everyone left is clocked out. */
    private function closeDay(array $args, User $closer): string
    {
        $site = $this->cast->site;
        $day = $this->days->current($site);
        $expected = (float) $this->dayCash->figures($site, $day, now())['expected'];
        $short = (float) $args['short'];

        $this->days->close($site, $closer, $this->qr->liveToken($site), $this->qr->settings($site)->closingItems(),
            round($expected - $short, 2), null, null, true, $short > 0 ? "Short {$short} birr: change given wrong at lunch" : null);

        return sprintf('%s closed: till %s birr (expected %s)', $closer->first_name, number_format($expected - $short, 2), number_format($expected, 2));
    }

    /** The day's driver takes the closer home in the van. */
    private function rideHome(array $args, User $driver): string
    {
        $rider = $this->cast->person($args['rider']);
        $ride = $this->rides->request($this->cast->site, $this->cast->person('manager'), now()->addMinutes(5), [$rider->id], 'Home after closing');
        $ride = $this->rides->claim($ride, $driver, $this->cast->van);
        $ride = $this->rides->depart($ride, $driver);
        $ride = $this->rides->drop($ride, $driver, (int) $rider->id);
        $this->rides->finish($ride, $driver);

        return "{$driver->first_name} drove {$rider->first_name} home";
    }

    /** Scheduled jobs at the end of the day: lapsed holds released, forgotten clock-ins closed. */
    private function endOfDay(array $args, User $as): string
    {
        $released = $this->stock->releaseStaleReservations(now());
        $closed = $this->attendance->autoClose(now());

        return "End of day: {$released} lapsed holds released, {$closed} clock-ins auto-closed";
    }

    /*
    |--------------------------------------------------------------------------
    | Sales
    |--------------------------------------------------------------------------
    */

    /** A seller builds the customer's cart and places the order; parts are set unless it is "pay later". */
    private function sale(array $args, User $seller): int
    {
        $cart = Cart::create([
            'store_id' => $this->cast->store->id,
            'user_id' => $seller->id,
            'customer_id' => $args['customer_id'],
            'seller_id' => $seller->id,
            'status' => 'open',
            'session_id' => (string) random_int(100000, 999999),
        ]);

        foreach ($args['lines'] as $line) {
            $variant = ItemVariant::query()->findOrFail($line['item_variant_id']);
            $cart->variants()->attach($variant->id, [
                'quantity' => $line['quantity'],
                'price' => $this->carts->resolveLinePrice($cart, $variant),
                'store_id' => $cart->store_id,
            ]);
        }

        $customer = Customer::query()->findOrFail($args['customer_id']);
        $driver = $this->cast->person($args['driver']);
        $input = match ($args['method']) {
            'courier' => [
                'delivery_method' => Delivery::METHOD_COURIER,
                'delivery_address' => $customer->first_name.', '.($customer->city ?: 'Addis Ababa'),
                'recipient_name' => $customer->name,
                'recipient_phone' => $customer->phone,
                'courier_id' => $driver->id,
                'delay_agreed' => true,
            ],
            'vehicle' => [
                'delivery_method' => Delivery::METHOD_VEHICLE,
                'vehicle_plate' => 'AA-3-'.random_int(10000, 99999),
                'driver_phone' => '0911'.random_int(100000, 999999),
                'delay_agreed' => true,
            ],
            default => ['delivery_method' => Delivery::METHOD_STORE],
        };

        $sale = $this->orders->place($cart->refresh(), $seller, $input);

        if ($args['split'] !== '') {
            $this->setParts($sale, $args['split'], $seller);
        }

        return (int) $sale->id;
    }

    /** "Pay later" orders: the customer comes back and pays. */
    private function pay(array $args, User $seller): string
    {
        $sale = $this->sale_($args['of']);
        $this->setParts($sale, $args['split'], $seller);

        return "{$sale->reference_number} paid by {$args['split']}";
    }

    /**
     * Split the order's total over the parts. A credit customer who is
     * overdue is refused credit (the rule working) and pays cash instead.
     */
    private function setParts(Sale $sale, string $split, User $seller): void
    {
        $methods = explode('+', $split);
        $total = (int) round((float) $sale->total_amount * 100);
        $parts = [];
        $left = $total;

        foreach ($methods as $n => $method) {
            // The first part of a split is about half, in whole tens of birr.
            $cents = $n === count($methods) - 1 ? $left : max(1000, intdiv($total * random_int(35, 65), 100 * 1000) * 1000);
            $cents = min($cents, $left - (count($methods) - 1 - $n));
            $left -= $cents;
            $parts[] = $this->part($method, $cents / 100);
        }

        try {
            $this->payments->setParts($sale, $parts, $seller);
        } catch (PaymentException $e) {
            // Overdue, or over the limit: the rule worked, and the customer pays cash instead.
            if (! in_array('credit', $methods, true) || ! preg_match('/overdue|credit is available/', $e->getMessage())) {
                throw $e;
            }

            // The customer pays cash after all; the manager confirms it.
            $this->payments->setParts($sale, [$this->part('cash', $total / 100)], $seller);
            $cash = $sale->payments()->where('payment_method', Payment::METHOD_CASH)->where('status', Payment::STATUS_CLAIMED)->firstOrFail();
            $this->payments->confirm($cash, $this->cast->person('manager'));

            $this->expected = "Credit refused for {$sale->customer?->name} ({$e->getMessage()}); paid cash instead";
        }
    }

    /** @return array<string, mixed> */
    private function part(string $method, float $amount): array
    {
        return match ($method) {
            'credit' => ['method' => Payment::METHOD_CREDIT, 'amount' => $amount],
            'bank' => ['payment_account_id' => $this->cast->bank->id, 'amount' => $amount, 'transaction_reference' => 'FT'.random_int(10000000, 99999999)],
            'wallet' => ['payment_account_id' => $this->cast->wallet->id, 'amount' => $amount, 'transaction_reference' => 'TB'.random_int(10000000, 99999999)],
            default => ['amount' => $amount],
        };
    }

    /** The customer says the transfer is sent; the seller marks the part paid. */
    private function claim(array $args, User $seller): string
    {
        $payment = $this->partOf($args['of'], $args['method'], Payment::STATUS_PENDING);
        $this->payments->claim($payment, $seller);

        return "{$seller->first_name} marked {$args['method']} paid";
    }

    /** The account owner (or, for cash, the manager) confirms the money arrived. */
    private function confirm(array $args, User $owner): string
    {
        // Credit was refused and the cash confirmed there and then (setParts): nothing left to check.
        if ($args['method'] === 'cash' && $this->sale_($args['of'])->payment_status === 'paid'
            && ! $this->sale_($args['of'])->payments()->where('payment_method', Payment::METHOD_CASH)->where('status', Payment::STATUS_CLAIMED)->exists()) {
            return 'Cash already confirmed';
        }

        $payment = $this->partOf($args['of'], $args['method'], Payment::STATUS_CLAIMED);
        $this->payments->confirm($payment, $owner);

        return "{$owner->first_name} confirmed {$args['method']} {$payment->amount}";
    }

    /** The owner cannot find the transfer: back to the seller. */
    private function reject(array $args, User $owner): string
    {
        $payment = $this->partOf($args['of'], $args['method'], Payment::STATUS_CLAIMED);
        $this->payments->reject($payment, $owner);

        return "{$owner->first_name} could not find the {$args['method']} transfer: rejected";
    }

    private function cancel(array $args, User $seller): string
    {
        $sale = $this->sale_($args['of']);
        $this->orders->cancel($sale, $seller);

        return "{$sale->reference_number} cancelled: the customer changed their mind";
    }

    /** Pick & pack: start, tick every line, pack, then confirm where each line came from. */
    private function pickPack(array $args, User $picker): string
    {
        $sale = $this->sale_($args['of']);

        if ($sale->fulfillment_stage !== Sale::STAGE_PICK_PACK) {
            throw new RuntimeException("{$sale->reference_number} is in [{$sale->fulfillment_stage}], not Pick & pack (payment {$sale->payment_status}).");
        }

        $plan = $this->sourcing->pickPackPlan($sale);
        $this->sourcing->startPicking($sale, $picker);

        $decisions = [];
        foreach ($sale->items as $item) {
            $this->sourcing->tickLine($sale, $item, true, $picker);
        }
        $this->sourcing->markPacked($sale, true, $picker);

        foreach ($plan['lines'] as $line) {
            $source = $line['suggested_source'] ?? throw new RuntimeException("Nowhere holds {$line['quantity']} × {$line['title']} for {$sale->reference_number}.");
            $decisions[] = ['sale_item_id' => $line['id'], 'location_type' => $source['location_type'], 'location_id' => $source['location_id']];
        }

        $this->sourcing->confirmSourcing($sale->refresh(), $decisions, $picker);

        return "{$picker->first_name} packed {$sale->reference_number}";
    }

    /** The courier (or, for a collection, the store keeper) moves the run on. */
    private function deliver(array $args, User $as): string
    {
        $sale = $this->sale_($args['of']);
        $delivery = $sale->delivery ?? throw new RuntimeException("{$sale->reference_number} has no delivery.");

        if ($args['step'] === DeliveryService::STATUS_DISPATCHED && $delivery->courier_id === null && $delivery->method === Delivery::METHOD_COURIER) {
            $this->deliveries->claim($delivery, $as);
        }

        $extra = $args['step'] === DeliveryService::STATUS_FAILED ? ['failure_reason' => $args['reason'] ?? 'Not delivered'] : [];

        if (! $this->deliveries->transition($delivery->refresh(), $args['step'], $extra)) {
            throw new RuntimeException("Delivery {$delivery->tracking_number} cannot go from [{$delivery->status}] to [{$args['step']}].");
        }

        return "{$sale->reference_number} {$args['step']}";
    }

    /** A credit customer pays back part of what they owe, in cash or by transfer. */
    private function repay(array $args, User $seller): int
    {
        $customer = $this->cast->credit[$args['customer']];
        $owed = $this->credit->outstandingCents((int) $customer->id);

        if ($owed < 1000) {
            throw new SimExpected("{$customer->name} owes nothing to repay");
        }

        $amount = max(10, intdiv(intdiv($owed, 2), 1000) * 10);
        $this->payments->setRepayment($customer, [$this->part($args['method'], (float) $amount)], $seller);

        return (int) Payment::query()->where('kind', Payment::KIND_REPAYMENT)->where('customer_id', $customer->id)
            ->where('user_id', $seller->id)->latest('id')->value('id');
    }

    /** The repayment is checked: a transfer is marked sent by the seller and confirmed by the owner, cash by the manager. */
    private function confirmRepayment(array $args, User $manager): string
    {
        $payment = Payment::query()->findOrFail($this->ref($args['of']));

        if ($payment->status === Payment::STATUS_PENDING) {
            $payment = $this->payments->claim($payment, User::query()->findOrFail($payment->user_id));
        }

        $owner = $payment->payment_account_id === null ? $manager : User::query()->findOrFail($payment->account->owner_user_id);
        $this->payments->confirm($payment, $owner);

        return "{$owner->first_name} confirmed a {$payment->amount} birr repayment";
    }

    /*
    |--------------------------------------------------------------------------
    | Money in and out
    |--------------------------------------------------------------------------
    */

    /** A seller hands the cash they hold to the manager's settlement account. */
    private function remit(array $args, User $seller): int
    {
        $cents = $this->ledger->availableCents((int) $seller->id, null);

        if ($cents <= 0) {
            throw new SimExpected("{$seller->first_name} holds no cash to hand over");
        }

        return (int) $this->remittances->remit($seller, null, $this->cast->settlement->id, $cents / 100, 'End of shift')->id;
    }

    private function confirmRemit(array $args, User $manager): string
    {
        $remittance = Remittance::query()->findOrFail($this->ref($args['of']));
        $this->remittances->confirm($remittance, $manager);

        return "{$manager->first_name} confirmed {$remittance->amount} birr handed over";
    }

    private function expense(array $args, User $by): int
    {
        return (int) $this->expenses->record($by, [
            'store_id' => $this->cast->store->id,
            'paid_from_till' => $args['till'],
            'category' => $args['category'],
            'amount' => $args['amount'],
            'spent_on' => LocalTime::dateOf(),
            'description' => $args['note'],
            'vehicle_id' => $args['category'] === 'fuel' ? $this->cast->van->id : null,
            'litres' => $args['category'] === 'fuel' ? 25 : null,
        ])->id;
    }

    private function expenseConfirm(array $args, User $finance): string
    {
        $expense = Expense::query()->findOrFail($this->ref($args['of']));
        $this->expenses->confirm($expense, $finance);

        return "{$finance->first_name} confirmed the {$expense->category} expense";
    }

    /*
    |--------------------------------------------------------------------------
    | Stock
    |--------------------------------------------------------------------------
    */

    /**
     * The hub keeper builds the morning shipment: the goods the store floor is
     * lowest on, from the hub, in the van, driven by today's driver. Everyone
     * agrees the slot (creator, origin dock, destination dock, driver).
     */
    private function shipmentCreate(array $args, User $hubKeeper): int
    {
        $driver = $this->cast->person($args['driver']);
        $floor = ItemStock::query()->where('stock_location_id', $this->cast->floor->id)
            ->whereIn('item_variant_id', $this->cast->hubGoods)->pluck('quantity', 'item_variant_id');
        $atHub = ItemStock::query()->where('stock_location_id', $this->cast->hub->id)
            ->whereIn('item_variant_id', $this->cast->hubGoods)->where('quantity', '>=', 20)->pluck('item_variant_id')->all();

        $lowest = collect($atHub)->sortBy(fn (int $id): int => (int) ($floor[$id] ?? 0))->take(8)->values();

        if ($lowest->isEmpty()) {
            throw new RuntimeException('The hub holds none of the store\'s goods to send.');
        }

        $slot = $this->shipments->normaliseSlot(now()->addMinutes(30)->toIso8601String());
        $shipment = $this->shipments->createBetween($this->cast->hub, $this->cast->floor, [
            'scheduled_for' => $slot,
            'vehicle_id' => $this->cast->van->id,
            'eligible_courier_ids' => [$driver->id],
        ], $hubKeeper->id);

        foreach ($lowest as $variantId) {
            $this->shipments->addItem($shipment, ItemVariant::query()->findOrFail($variantId), 20);
        }

        $this->shipments->recordPartyAgreement($shipment, ShipmentWorkflowService::PARTY_ORIGIN, $slot, $hubKeeper);
        $this->shipments->recordPartyAgreement($shipment->refresh(), ShipmentWorkflowService::PARTY_DESTINATION, $slot, $this->cast->person('keeper'));
        $shipment = $this->shipments->recordPartyAgreement($shipment->refresh(), ShipmentWorkflowService::PARTY_FLEET, $slot, $driver);

        if ($shipment->status !== ShipmentWorkflowService::SCHEDULED) {
            throw new RuntimeException("{$shipment->reference} is [{$shipment->status}] after every party agreed, not scheduled.");
        }

        return (int) $shipment->id;
    }

    private function shipmentPick(array $args, User $hubKeeper): string
    {
        $shipment = $this->shipment();
        $this->handoff->perform($shipment, ShipmentHandoffService::START_PICKING, $hubKeeper);

        foreach ($shipment->items()->get() as $line) {
            $this->handoff->perform($shipment->refresh(), ShipmentHandoffService::PICK_LINE, $hubKeeper, ['variant_id' => $line->item_variant_id, 'picked' => true]);
        }

        $this->handoff->perform($shipment->refresh(), ShipmentHandoffService::PREPARED, $hubKeeper, ['bay' => 'Bay 1']);

        return "{$shipment->reference} picked and in Bay 1";
    }

    private function shipmentLoad(array $args, User $driver): string
    {
        $shipment = $this->shipment();

        foreach ([ShipmentHandoffService::COURIER_START, ShipmentHandoffService::COURIER_CHECK, ShipmentHandoffService::COURIER_SIGN] as $step) {
            $this->handoff->perform($shipment->refresh(), $step, $driver, ['signature' => SimSignature::png($driver->first_name)]);
        }

        return "{$driver->first_name} signed for {$shipment->reference} and set off";
    }

    private function shipmentArrive(array $args, User $driver): string
    {
        $shipment = $this->shipment();
        $this->handoff->perform($shipment, ShipmentHandoffService::COURIER_ARRIVE, $driver);

        return "{$shipment->reference} arrived at {$this->cast->store->name}";
    }

    /** The store keeper counts the load (three short on one line, one day) and signs it in. */
    private function shipmentReceive(array $args, User $keeper): string
    {
        $shipment = $this->shipment();
        $this->handoff->perform($shipment, ShipmentHandoffService::RECEIVER_CHECK, $keeper);

        $note = '';
        if ($args['short']) {
            $line = $shipment->items()->orderBy('id')->firstOrFail();
            $this->receiving->recordShipmentCounts($shipment, [(int) $line->item_variant_id => ['received' => max(0, (int) $line->quantity - 3), 'note' => 'Three missing from the carton']]);
            $note = ' (three short on one line)';
        }

        $this->handoff->perform($shipment->refresh(), ShipmentHandoffService::RECEIVER_SIGN, $keeper, ['signature' => SimSignature::png($keeper->first_name)]);

        return "{$keeper->first_name} signed {$shipment->reference} in{$note}";
    }

    /** A second person settles the short shipment line: found, or lost (written off from the driver's custody). */
    private function resolveShortage(array $args, User $manager): string
    {
        $shipment = $this->shipment();
        $rows = \App\Models\Inventory\ReceiptDiscrepancy::query()->where('status', \App\Models\Inventory\ReceiptDiscrepancy::OPEN)
            ->where('receivable_type', Shipment::class)->where('receivable_id', $shipment->id)->get();

        if ($rows->isEmpty()) {
            throw new RuntimeException("{$shipment->reference} has no open discrepancy to settle.");
        }

        foreach ($rows as $row) {
            $this->receiving->resolve($row, $args['resolution'], $args['note'], $manager);
        }

        return "{$manager->first_name} settled {$rows->count()} short line(s) of {$shipment->reference} as {$args['resolution']}";
    }

    /** The store keeper refills the shelf from the floor: the goods lowest on the shelf, ten each. */
    private function shelfRefill(array $args, User $keeper): string
    {
        $shelf = ItemStock::query()->where('stock_location_id', $this->cast->shelf->id)->pluck('quantity', 'item_variant_id');
        $floor = ItemStock::query()->where('stock_location_id', $this->cast->floor->id)->pluck('quantity', 'item_variant_id');
        $moved = 0;

        foreach (collect($this->cast->goods)->pluck('item_variant_id')->sortBy(fn (int $id): int => (int) ($shelf[$id] ?? 0)) as $variantId) {
            if ($moved >= $args['lines'] || (int) ($floor[$variantId] ?? 0) < 10) {
                continue;
            }

            $this->stock->move($variantId, $this->cast->floor, $this->cast->shelf, 10, ['reason' => 'Shelf refill', 'user_id' => $keeper->id]);
            $moved++;
        }

        return "{$keeper->first_name} refilled {$moved} shelf lines from the floor";
    }

    /** The weekly shelf count: one line two short. */
    private function stockCount(array $args, User $keeper): int
    {
        $take = $this->stocktakes->start($this->cast->shelf, $keeper, 'Weekly shelf count');
        $held = ItemStock::query()->where('stock_location_id', $this->cast->shelf->id)->where('quantity', '>', 2)
            ->orderByDesc('quantity')->limit($args['lines'])->pluck('quantity', 'item_variant_id');

        $n = 0;
        foreach ($held as $variantId => $quantity) {
            $this->stocktakes->count($take, (int) $variantId, (int) $quantity - ($n++ === 0 ? $args['short'] : 0), $keeper);
        }

        $this->stocktakes->submit($take->refresh(), $keeper);

        return (int) $take->id;
    }

    private function stockCountPost(array $args, User $manager): string
    {
        $take = Stocktake::query()->findOrFail($this->ref($args['of']));
        $this->stocktakes->post($take, $manager);

        return "{$manager->first_name} approved the shelf count";
    }

    /*
    |--------------------------------------------------------------------------
    | Lookups
    |--------------------------------------------------------------------------
    */

    private function ref(string $ref): int
    {
        return $this->refs[$ref] ?? throw new RuntimeException("Nothing was made for [{$ref}].");
    }

    private function sale_(string $ref): Sale
    {
        return Sale::query()->with(['items', 'delivery', 'customer'])->findOrFail($this->ref($ref));
    }

    private function shipment(): Shipment
    {
        // The day's shipment is the latest one the sim made.
        $id = collect($this->refs)->filter(fn (int $id, string $ref): bool => str_ends_with($ref, '-ship'))->last();

        return Shipment::query()->findOrFail($id ?? throw new RuntimeException('No shipment was built today.'));
    }

    private function partOf(string $ref, string $method, string $status): Payment
    {
        $sale = $this->sale_($ref);
        $query = $sale->payments()->where('status', $status);
        $query = match ($method) {
            'cash' => $query->where('payment_method', Payment::METHOD_CASH),
            'bank' => $query->where('payment_account_id', $this->cast->bank->id),
            default => $query->where('payment_account_id', $this->cast->wallet->id),
        };

        return $query->orderBy('id')->first()
            ?? throw new RuntimeException("{$sale->reference_number} has no {$status} {$method} part.");
    }

    /** @return array{0: string, 1: string} */
    private function hours(string $date): array
    {
        $hours = $this->sites->hoursOn($this->cast->site, $date);

        return [substr((string) ($hours['opens_at'] ?? '08:00'), 0, 5), substr((string) ($hours['closes_at'] ?? '19:00'), 0, 5)];
    }
}
