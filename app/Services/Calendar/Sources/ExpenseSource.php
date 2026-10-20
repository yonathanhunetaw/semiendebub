<?php

declare(strict_types=1);

namespace App\Services\Calendar\Sources;

use App\Models\Finance\Expense;
use App\Services\Calendar\CalendarItem;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarSource;
use App\Services\Finance\ExpenseService;
use Carbon\CarbonImmutable;

/**
 * Expenses claimed and waiting for a second person to confirm them, on the
 * day they were spent, for those who may confirm (finance, global admins):
 * never the person who recorded one (the two-person rule).
 */
class ExpenseSource implements CalendarSource
{
    public function key(): string
    {
        return 'expenses';
    }

    public function label(): string
    {
        return 'Expenses to confirm';
    }

    public function tone(): string
    {
        return 'warning';
    }

    public function apps(): array
    {
        return ['admin'];
    }

    public function events(CalendarScope $scope, CarbonImmutable $from, CarbonImmutable $to): array
    {
        if (! ExpenseService::mayConfirm($scope->viewer)) {
            return [];
        }

        return Expense::query()
            ->with('recorder:id,first_name,last_name')
            ->where('status', Expense::STATUS_CLAIMED)
            ->where('recorded_by', '!=', $scope->viewer->id)
            ->whereBetween('spent_on', [$from->toDateString(), $to->toDateString()])
            ->when($scope->storeIds !== null, fn ($q) => $q->whereIn('store_id', $scope->storeIds))
            ->orderBy('spent_on')
            ->limit(500)
            ->get()
            ->map(fn (Expense $expense): array => CalendarItem::make(
                id: "expense:{$expense->id}",
                source: $this->key(),
                kind: 'expense',
                title: 'Confirm '.ucfirst((string) $expense->category),
                start: CarbonImmutable::parse($expense->spent_on->toDateString()),
                end: null,
                allDay: true,
                state: CalendarItem::UPCOMING,
                status: (string) $expense->status,
                subtitle: trim(($expense->description ?? '').($expense->recorder ? ' · recorded by '.$expense->recorder->first_name : ''), ' ·') ?: null,
                url: CalendarItem::url("{$scope->app}.expenses.index"),
                amount: $expense->amount,
                currency: $expense->currency ?: 'ETB',
            ))->all();
    }
}
