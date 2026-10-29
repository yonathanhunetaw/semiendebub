<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Models\Finance\Payment;
use App\Models\Finance\Remittance;
use App\Models\Inventory\StockLocation;
use App\Models\Workforce\SiteDay;
use App\Services\Workforce\ShopDay;
use Carbon\CarbonImmutable;
use Carbon\CarbonInterface;
use Illuminate\Support\Facades\DB;

/**
 * A business day's cash, and what the till should hold when it closes.
 *
 *   expected till = opening float + cash taken during the day - cash handed over during the day
 *
 * Cash is "taken" the moment a seller records it (claimed); it is "confirmed"
 * once a second person confirms it. Cash still unconfirmed at closing is not a
 * problem for the till (the money is in it), only for the books: it is carried
 * on, shown with the day it was taken. Cash handed over after closing is shown
 * on the day it is handed over.
 *
 * Money is added in cents.
 */
final class DayCash
{
    public function __construct(private readonly ShopDay $shopDay)
    {
    }

    /**
     * @param  CarbonInterface|null  $until  the end of the span; default is when the day closed, else now
     * @return array{float: float, collected: float, confirmed: float, unconfirmed: float, handed_over: float, expected: float, has_cash: bool}
     */
    public function figures(StockLocation $site, SiteDay $day, ?CarbonInterface $until = null): array
    {
        $span = $this->shopDay->span($day);

        if ($span === null || $site->store_id === null) {
            return $this->empty($day);
        }

        $from = $span[0];
        $to = CarbonImmutable::instance($until ?? $span[1] ?? now())->utc();

        $takenAt = DB::raw('COALESCE(payments.paid_at, payments.created_at)');
        $storeOf = DB::raw('COALESCE((select store_id from sales where sales.id = payments.sale_id), (select store_id from customers where customers.id = payments.customer_id))');

        $cash = fn () => Payment::query()
            ->where('payments.payment_method', Payment::METHOD_CASH)
            ->whereIn('payments.status', [Payment::STATUS_CLAIMED, Payment::STATUS_CONFIRMED])
            ->where($storeOf, $site->store_id)
            ->where($takenAt, '>=', $from)
            ->where($takenAt, '<=', $to);

        $collected = $this->cents($cash()->sum('payments.amount'));
        $confirmed = $this->cents($cash()->where('payments.status', Payment::STATUS_CONFIRMED)->sum('payments.amount'));

        // Cash handed over by this store's people during the day (not to a pending reject).
        $handed = $this->cents(Remittance::query()
            ->whereNull('from_payment_account_id')
            ->whereIn('status', [Remittance::STATUS_CLAIMED, Remittance::STATUS_CONFIRMED])
            ->whereIn('user_id', DB::table('users')->where('store_id', $site->store_id)->select('id'))
            ->where('created_at', '>=', $from)
            ->where('created_at', '<=', $to)
            ->sum('amount'));

        $float = $this->cents($day->float_amount ?? 0);

        return [
            'float' => $float / 100.0,
            'collected' => $collected / 100.0,
            'confirmed' => $confirmed / 100.0,
            'unconfirmed' => ($collected - $confirmed) / 100.0,
            'handed_over' => $handed / 100.0,
            'expected' => ($float + $collected - $handed) / 100.0,
            'has_cash' => $float !== 0 || $collected !== 0 || $handed !== 0,
        ];
    }

    /**
     * Compare the counted till with the day's cash.
     *
     * Returns what to store on the closed day. Refuses (with the numbers) when
     * cash moved but the till was not counted, or when the count differs from
     * what it should be and nobody has said why.
     *
     * @param  array<string, mixed>  $cash  from figures()
     * @return array<string, float|string|null>
     *
     * @throws \App\Exceptions\WorkforceException
     */
    public function settle(array $cash, ?float $counted, ?string $why): array
    {
        $why = $why !== null && trim($why) !== '' ? trim($why) : null;

        if ($counted === null) {
            if ($cash['has_cash']) {
                throw new \App\Exceptions\WorkforceException('Cash moved today. Count the till before closing.');
            }

            return $this->snapshot($cash, null, null);
        }

        $difference = round($counted - (float) $cash['expected'], 2);

        if (abs($difference) >= 0.01 && $why === null) {
            throw new \App\Exceptions\WorkforceException(sprintf(
                'The till is %s ETB %s (counted %s, expected %s). Say why before closing.',
                $difference < 0 ? 'short by' : 'over by',
                number_format(abs($difference), 2),
                number_format($counted, 2),
                number_format((float) $cash['expected'], 2),
            ));
        }

        return $this->snapshot($cash, $difference, abs($difference) >= 0.01 ? $why : null);
    }

    /** @return array<string, float|string|null> */
    private function snapshot(array $cash, ?float $difference, ?string $why): array
    {
        return [
            'cash_collected' => $cash['collected'],
            'cash_unconfirmed' => $cash['unconfirmed'],
            'cash_handed_over' => $cash['handed_over'],
            'cash_expected' => $cash['expected'],
            'till_difference' => $difference,
            'till_difference_note' => $why,
        ];
    }

    /** @return array{float: float, collected: float, confirmed: float, unconfirmed: float, handed_over: float, expected: float, has_cash: bool} */
    private function empty(SiteDay $day): array
    {
        $float = (float) ($day->float_amount ?? 0);

        return ['float' => $float, 'collected' => 0.0, 'confirmed' => 0.0, 'unconfirmed' => 0.0, 'handed_over' => 0.0, 'expected' => $float, 'has_cash' => $float !== 0.0];
    }

    private function cents(mixed $amount): int
    {
        return (int) round(((float) $amount) * 100);
    }
}
