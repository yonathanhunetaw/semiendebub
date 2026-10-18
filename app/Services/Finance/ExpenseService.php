<?php

declare(strict_types=1);

namespace App\Services\Finance;

use App\Exceptions\PaymentException;
use App\Models\Auth\User;
use App\Models\Finance\Expense;
use App\Models\Workforce\StaffRide;
use App\Services\Documents\DocumentService;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;

/**
 * Expenses: money that went out (fuel, rent, salaries…).
 *
 *   record    someone says it was spent, with an optional receipt photo. It
 *             is claimed: it does not count yet.
 *   rideFuel  the driver of a staff ride records the fuel it took (once per
 *             ride; again only after a rejection). Store and car come from
 *             the ride.
 *   confirm   finance or a global admin, never the recorder, says it is
 *             right: it counts.
 *   reject    it is not, with a reason.
 *
 * Two people on every money part, like payments (docs: two-person payments).
 */
class ExpenseService
{
    public function __construct(private readonly DocumentService $documents)
    {
    }

    /**
     * @param  array{category: string, amount: float|string, spent_on?: string|null, description?: string|null, store_id?: int|null, vehicle_id?: int|null, litres?: float|string|null}  $data
     *
     * @throws PaymentException
     */
    public function record(User $by, array $data, ?UploadedFile $receipt = null, ?StaffRide $ride = null): Expense
    {
        $amount = round((float) $data['amount'], 2);
        if ($amount <= 0) {
            throw new PaymentException('An expense is above zero.');
        }

        if (! in_array($data['category'], Expense::CATEGORIES, true)) {
            throw new PaymentException('Pick a kind of expense.');
        }

        $spentOn = CarbonImmutable::parse($data['spent_on'] ?? now()->toDateString())->toDateString();
        if ($spentOn > now()->addDay()->toDateString()) {
            throw new PaymentException('An expense is for today or a day before.');
        }

        return DB::transaction(function () use ($by, $data, $receipt, $ride, $amount, $spentOn): Expense {
            $document = $receipt !== null ? $this->documents->upload($receipt, $by, isset($data['store_id']) ? (int) $data['store_id'] : null) : null;

            return Expense::create([
                'store_id' => $data['store_id'] ?? null,
                'category' => $data['category'],
                'amount' => $amount,
                'currency' => 'ETB',
                'spent_on' => $spentOn,
                'description' => isset($data['description']) && trim((string) $data['description']) !== '' ? trim((string) $data['description']) : null,
                'vehicle_id' => $data['vehicle_id'] ?? null,
                'litres' => isset($data['litres']) && $data['litres'] !== '' ? (float) $data['litres'] : null,
                'source_type' => $ride !== null ? StaffRide::class : null,
                'source_id' => $ride?->id,
                'document_id' => $document?->id,
                'status' => Expense::STATUS_CLAIMED,
                'recorded_by' => $by->id,
            ]);
        });
    }

    /** @throws PaymentException */
    public function rideFuel(StaffRide $ride, User $driver, float $amount, ?float $litres = null, ?UploadedFile $receipt = null): Expense
    {
        $ride->loadMissing(['site', 'vehicle']);

        if ((int) $ride->driver_id !== (int) $driver->id) {
            throw new PaymentException('Only the ride’s driver records its fuel.', 403);
        }

        if (! in_array($ride->status, [StaffRide::STATUS_DEPARTED, StaffRide::STATUS_DONE], true)) {
            throw new PaymentException('Record the fuel once the ride has set off.');
        }

        $open = Expense::query()->where('source_type', StaffRide::class)->where('source_id', $ride->id)
            ->whereIn('status', [Expense::STATUS_CLAIMED, Expense::STATUS_CONFIRMED])->exists();
        if ($open) {
            throw new PaymentException('The fuel for this ride is already recorded.');
        }

        return $this->record($driver, [
            'category' => 'fuel',
            'amount' => $amount,
            'spent_on' => ($ride->departed_at ?? now())->toDateString(),
            'description' => sprintf('Staff ride from %s', $ride->site?->name ?? 'a site'),
            'store_id' => $ride->site?->store_id,
            'vehicle_id' => $ride->vehicle_id,
            'litres' => $litres,
        ], $receipt, $ride);
    }

    /** @throws PaymentException */
    public function confirm(Expense $expense, User $by): Expense
    {
        return DB::transaction(function () use ($expense, $by): Expense {
            $expense = $this->claimedFor($expense, $by);
            $expense->update(['status' => Expense::STATUS_CONFIRMED, 'decided_by' => $by->id, 'decided_at' => now()]);

            return $expense;
        });
    }

    /** @throws PaymentException */
    public function reject(Expense $expense, User $by, string $reason): Expense
    {
        return DB::transaction(function () use ($expense, $by, $reason): Expense {
            $expense = $this->claimedFor($expense, $by);

            if (trim($reason) === '') {
                throw new PaymentException('Say why it does not count.');
            }

            $expense->update(['status' => Expense::STATUS_REJECTED, 'decided_by' => $by->id, 'decided_at' => now(), 'reject_reason' => trim($reason)]);

            return $expense;
        });
    }

    public static function mayConfirm(?User $user): bool
    {
        return $user !== null && ($user->isRole('finance') || ($user->isRole('admin') && $user->store_id === null) || $user->isRole('dev'));
    }

    /**
     * Confirmed spending per category between two dates.
     *
     * @return array<string, float>
     */
    public function totals(string $from, string $to): array
    {
        return Expense::query()
            ->where('status', Expense::STATUS_CONFIRMED)
            ->whereBetween('spent_on', [$from, $to])
            ->selectRaw('category, sum(amount) as total')
            ->groupBy('category')
            ->pluck('total', 'category')
            ->map(fn ($total): float => round((float) $total, 2))
            ->all();
    }

    /** @return array<string, mixed> */
    public function present(Expense $expense, ?User $viewer, string $app): array
    {
        $expense->loadMissing(['store', 'vehicle', 'recorder', 'decider', 'receipt']);
        $name = fn (?User $user): ?string => $user ? trim($user->first_name.' '.$user->last_name) : null;

        return [
            'id' => (int) $expense->id,
            'category' => $expense->category,
            'amount' => (float) $expense->amount,
            'currency' => $expense->currency,
            'spent_on' => $expense->spent_on->toDateString(),
            'description' => $expense->description,
            'store' => $expense->store?->name,
            'vehicle' => $expense->vehicle ? $expense->vehicle->name.' · '.$expense->vehicle->plate : null,
            'litres' => $expense->litres !== null ? (float) $expense->litres : null,
            'ride_id' => $expense->source_type === StaffRide::class ? (int) $expense->source_id : null,
            'status' => $expense->status,
            'recorded_by' => $name($expense->recorder),
            'decided_by' => $name($expense->decider),
            'reject_reason' => $expense->reject_reason,
            'receipt_url' => $expense->document_id !== null ? route("{$app}.expenses.receipt", $expense->id) : null,
            'can_decide' => $expense->status === Expense::STATUS_CLAIMED && self::mayConfirm($viewer) && (int) $expense->recorded_by !== (int) $viewer?->id,
        ];
    }

    /** @param Builder<Expense> $query */
    public static function waiting(Builder $query): Builder
    {
        return $query->where('status', Expense::STATUS_CLAIMED);
    }

    /** @throws PaymentException */
    private function claimedFor(Expense $expense, User $by): Expense
    {
        $expense = Expense::query()->lockForUpdate()->findOrFail($expense->id);

        if ((int) $expense->recorded_by === (int) $by->id) {
            throw new PaymentException('You recorded this expense yourself. A second person confirms it.', 403);
        }

        if (! self::mayConfirm($by)) {
            throw new PaymentException('Only finance or a global admin confirms expenses.', 403);
        }

        if ($expense->status !== Expense::STATUS_CLAIMED) {
            throw new PaymentException('This expense is not waiting for confirmation.');
        }

        return $expense;
    }
}
