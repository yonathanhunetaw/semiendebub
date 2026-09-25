<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Auth\User;
use App\Models\Fulfillment\Delivery;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Carbon;

/**
 * Courier-facing view of the fulfilment queue.
 *
 * A run moves pending → dispatched → in_transit → delivered, or exits to
 * `failed`/`returned`. Each transition stamps its own timestamp, so the
 * history of a run is reconstructable from the row alone.
 *
 * Statuses are exactly the `deliveries.status` ENUM — no schema change was
 * needed to model the courier workflow.
 */
class DeliveryService
{
    /*
    |--------------------------------------------------------------------------
    | Statuses
    |--------------------------------------------------------------------------
    |
    | These mirror the `deliveries.status` ENUM exactly. Assignment is *not* a
    | status: a run is "in the pool" while it is pending with no courier_id,
    | and "mine" once a courier claims it, still pending until they collect it.
    |
    */

    public const STATUS_PENDING = 'pending';

    public const STATUS_DISPATCHED = 'dispatched';

    public const STATUS_IN_TRANSIT = 'in_transit';

    public const STATUS_DELIVERED = 'delivered';

    public const STATUS_FAILED = 'failed';

    public const STATUS_RETURNED = 'returned';

    /**
     * Which status a run may move to next.
     *
     * @var array<string, array<int, string>>
     */
    private const TRANSITIONS = [
        self::STATUS_PENDING => [self::STATUS_DISPATCHED, self::STATUS_FAILED],
        self::STATUS_DISPATCHED => [self::STATUS_IN_TRANSIT, self::STATUS_FAILED, self::STATUS_RETURNED],
        self::STATUS_IN_TRANSIT => [self::STATUS_DELIVERED, self::STATUS_FAILED, self::STATUS_RETURNED],
        self::STATUS_DELIVERED => [],
        // A failed attempt can be retried or sent back to the depot.
        self::STATUS_FAILED => [self::STATUS_DISPATCHED, self::STATUS_RETURNED],
        self::STATUS_RETURNED => [],
    ];

    /**
     * Timestamp column stamped when a run enters each status.
     *
     * @var array<string, string>
     */
    private const STAMPS = [
        self::STATUS_DISPATCHED => 'picked_up_at',
        self::STATUS_IN_TRANSIT => 'shipped_at',
        self::STATUS_DELIVERED => 'delivered_at',
        self::STATUS_FAILED => 'failed_at',
    ];

    /**
     * Headline counters for one courier's day.
     *
     * @return array<string, int>
     */
    public function metrics(User $courier): array
    {
        $mine = fn (): Builder => Delivery::query()->forCourier((int) $courier->id);

        return [
            // Claimed but not yet collected.
            'assigned' => (int) $mine()->where('status', self::STATUS_PENDING)->count(),
            'picked_up' => (int) $mine()->where('status', self::STATUS_DISPATCHED)->count(),
            'in_transit' => (int) $mine()->where('status', self::STATUS_IN_TRANSIT)->count(),
            'delivered_today' => (int) $mine()
                ->where('status', self::STATUS_DELIVERED)
                ->whereDate('delivered_at', Carbon::today())
                ->count(),
            'delivered_total' => (int) $mine()->where('status', self::STATUS_DELIVERED)->count(),
            'failed' => (int) $mine()->where('status', self::STATUS_FAILED)->count(),
            'open' => (int) $mine()->open()->count(),
            'unassigned' => (int) Delivery::query()->unassigned()->where('status', self::STATUS_PENDING)->count(),
        ];
    }

    /**
     * The courier's active workload, most urgent first.
     *
     * @return LengthAwarePaginator<int, Delivery>
     */
    public function paginateForCourier(
        User $courier,
        ?string $status = null,
        ?string $search = null,
        ?int $perPage = null
    ): LengthAwarePaginator {
        $query = Delivery::query()
            ->with(['sale', 'courier'])
            ->forCourier((int) $courier->id);

        if ($status === 'open') {
            $query->open();
        } elseif ($status !== null && $status !== 'all') {
            $query->where('status', $status);
        }

        $this->applySearch($query, $search);

        return $query
            ->orderByRaw("FIELD(status, 'in_transit', 'dispatched', 'pending', 'failed', 'delivered', 'returned')")
            ->orderBy('scheduled_for')
            ->orderByDesc('id')
            ->paginate($perPage ?? 20)
            ->withQueryString();
    }

    /**
     * Runs nobody has picked up yet — the pool a courier can claim from.
     *
     * @return LengthAwarePaginator<int, Delivery>
     */
    public function paginateUnassigned(?string $search = null, ?int $perPage = null): LengthAwarePaginator
    {
        $query = Delivery::query()
            ->with('sale')
            ->unassigned()
            ->where('status', self::STATUS_PENDING);

        $this->applySearch($query, $search);

        return $query
            ->orderBy('scheduled_for')
            ->orderByDesc('id')
            ->paginate($perPage ?? 20)
            ->withQueryString();
    }

    /**
     * Completed and closed runs, for the history screen.
     *
     * @return LengthAwarePaginator<int, Delivery>
     */
    public function paginateHistory(
        User $courier,
        ?string $search = null,
        ?int $perPage = null
    ): LengthAwarePaginator {
        $query = Delivery::query()
            ->with('sale')
            ->forCourier((int) $courier->id)
            ->whereIn('status', [self::STATUS_DELIVERED, self::STATUS_FAILED, self::STATUS_RETURNED]);

        $this->applySearch($query, $search);

        return $query
            ->orderByDesc('delivered_at')
            ->orderByDesc('id')
            ->paginate($perPage ?? 20)
            ->withQueryString();
    }

    /**
     * Claim an unassigned run.
     *
     * Claiming records ownership only; the run stays `pending` until the
     * courier actually collects it and moves it to `dispatched`.
     */
    public function claim(Delivery $delivery, User $courier): bool
    {
        if ($delivery->courier_id !== null || $delivery->status !== self::STATUS_PENDING) {
            return false;
        }

        $delivery->update([
            'courier_id' => $courier->id,
            'courier_name' => trim($courier->first_name . ' ' . $courier->last_name),
        ]);

        return true;
    }

    /**
     * Advance a run, refusing any move the lifecycle does not allow.
     *
     * @param  array<string, mixed>  $extra
     */
    public function transition(Delivery $delivery, string $to, array $extra = []): bool
    {
        $from = (string) $delivery->status;

        if (! in_array($to, self::TRANSITIONS[$from] ?? [], true)) {
            return false;
        }

        $payload = array_merge(['status' => $to], $extra);

        if (isset(self::STAMPS[$to])) {
            $payload[self::STAMPS[$to]] = now();
        }

        $delivery->update($payload);

        return true;
    }

    /**
     * What this run can legally become next.
     *
     * @return array<int, string>
     */
    public function allowedTransitions(Delivery $delivery): array
    {
        return self::TRANSITIONS[(string) $delivery->status] ?? [];
    }

    /**
     * @return array<string, mixed>
     */
    public function present(Delivery $delivery): array
    {
        return [
            'id' => (int) $delivery->id,
            'tracking_number' => $delivery->tracking_number,
            'status' => (string) $delivery->status,
            'recipient_name' => $delivery->recipient_name,
            'recipient_phone' => $delivery->recipient_phone,
            'delivery_address' => $delivery->delivery_address,
            'courier_name' => $delivery->courier_name,
            'courier_id' => $delivery->courier_id ? (int) $delivery->courier_id : null,
            'sale_reference' => $delivery->sale?->reference_number,
            'sale_total' => $delivery->sale?->total_amount !== null
                ? (float) $delivery->sale->total_amount
                : null,
            'notes' => $delivery->notes,
            'failure_reason' => $delivery->failure_reason,
            'scheduled_for' => $delivery->scheduled_for?->toIso8601String(),
            'picked_up_at' => $delivery->picked_up_at?->toIso8601String(),
            'shipped_at' => $delivery->shipped_at?->toIso8601String(),
            'delivered_at' => $delivery->delivered_at?->toIso8601String(),
            'failed_at' => $delivery->failed_at?->toIso8601String(),
            'created_at' => $delivery->created_at?->toIso8601String(),
            'allowed_transitions' => $this->allowedTransitions($delivery),
        ];
    }

    /**
     * @param  Builder<Delivery>  $query
     */
    private function applySearch(Builder $query, ?string $search): void
    {
        if ($search === null || $search === '') {
            return;
        }

        $term = '%' . $search . '%';

        $query->where(function (Builder $q) use ($term): void {
            $q->where('tracking_number', 'LIKE', $term)
                ->orWhere('recipient_name', 'LIKE', $term)
                ->orWhere('recipient_phone', 'LIKE', $term)
                ->orWhere('delivery_address', 'LIKE', $term);
        });
    }
}
