<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\StockKeeper\Transfer;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Workforce\LocalTime;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Transfers between two places, as a whole day on the shops' day they are
 * planned for (`eta`, stored as that day's local midnight in UTC).
 */
class TransferSource implements CalendarSource
{
    public function key(): string
    {
        return 'transfers';
    }

    public function label(): string
    {
        return 'Transfers';
    }

    public function tone(): string
    {
        return 'tertiary';
    }

    public function apps(): array
    {
        return ['admin', 'stock_keeper', 'delivery'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        $query = Transfer::query()
            ->with(['fromStore:id,name', 'toStore:id,name'])
            ->whereBetween('eta', [$from, $to])
            ->where('status', '!=', 'cancelled')
            ->where(fn (Builder $q) => $q->whereNull('approval_state')->orWhere('approval_state', '!=', Transfer::APPROVAL_REJECTED));

        if ($scope->courierId !== null) {
            $query->where('courier_id', $scope->courierId);
        } elseif ($scope->storeIds !== null) {
            $ids = $scope->storeIds;
            $query->where(fn (Builder $q) => $q->whereIn('from_store_id', $ids)->orWhereIn('to_store_id', $ids));
        }

        return $query->orderBy('eta')->limit(500)->get()
            ->map(function (Transfer $transfer) use ($scope): array {
                $day = LocalTime::dateOf($transfer->eta);
                $done = $transfer->status === 'completed';
                $from = $transfer->fromStore?->name;
                $to = $transfer->toStore?->name;

                return CalendarItem::make(
                    id: "transfer:{$transfer->id}",
                    source: $this->key(),
                    kind: 'transfer',
                    title: 'Transfer '.($transfer->reference ?: "#{$transfer->id}"),
                    start: CarbonImmutable::parse($day),
                    end: null,
                    allDay: true,
                    state: match (true) {
                        $done => CalendarItem::DONE,
                        $day < LocalTime::dateOf() => CalendarItem::LATE,
                        default => CalendarItem::UPCOMING,
                    },
                    status: (string) $transfer->status,
                    subtitle: trim("{$transfer->quantity} units".($from || $to ? ' · '.($from ?? '?').' → '.($to ?? '?') : '')),
                    url: match ($scope->app) {
                        'admin' => CalendarItem::url('admin.inventory.transfers.show', $transfer->id),
                        'stock_keeper' => CalendarItem::url('stock_keeper.transfers.index'),
                        'delivery' => CalendarItem::url('delivery.transfers.index'),
                        default => null,
                    },
                );
            })->all();
    }
}
