<?php

declare(strict_types=1);

namespace App\Services\Calendar;

use App\Models\Auth\User;
use App\Models\Calendar\CalendarEvent;
use App\Models\Calendar\CalendarEventCompletion;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * Writes to the calendar's own entries. Every change goes through here so the
 * page, and later the document reader, follow the same rules.
 */
class CalendarEventService
{
    public function __construct(private readonly Recurrence $recurrence)
    {
    }

    /** @param array<string, mixed> $data validated fields of CalendarEvent */
    public function create(User $by, ?int $storeId, array $data, ?Model $source = null): CalendarEvent
    {
        return CalendarEvent::query()->create($this->normalise($data) + [
            'created_by' => $by->id,
            'store_id' => $storeId,
            'source_type' => $source?->getMorphClass(),
            'source_id' => $source?->getKey(),
        ]);
    }

    /** @param array<string, mixed> $data */
    public function update(CalendarEvent $entry, array $data): CalendarEvent
    {
        $entry->update($this->normalise($data));

        return $entry->refresh();
    }

    public function delete(CalendarEvent $entry): void
    {
        $entry->delete();
    }

    /** Tick off the occurrence that falls on $day (a bill paid, a shift worked). */
    public function complete(CalendarEvent $entry, CarbonImmutable $day, User $by, mixed $amount = null, ?string $note = null, ?Model $source = null): CalendarEventCompletion
    {
        if (! $this->recurrence->occursOn($entry, $day)) {
            throw new InvalidArgumentException("\"{$entry->title}\" has no occurrence on {$day->toDateString()}.");
        }

        return CalendarEventCompletion::query()->updateOrCreate(
            ['calendar_event_id' => $entry->id, 'occurs_on' => $day->toDateString()],
            [
                'completed_at' => now(),
                'completed_by' => $by->id,
                'amount' => $amount ?? $entry->amount,
                'note' => $note,
                'source_type' => $source?->getMorphClass(),
                'source_id' => $source?->getKey(),
            ],
        );
    }

    public function reopen(CalendarEvent $entry, CarbonImmutable $day): void
    {
        $entry->completions()->whereDate('occurs_on', $day->toDateString())->delete();
    }

    /**
     * "This receipt was paid on $paidOn and repeats": one bill series starting
     * that day, its first occurrence already ticked paid, so the calendar shows
     * it paid on the day and due again on the next one (next month, for a
     * monthly bill).
     *
     * This is the call the document upload makes once the reader has found a
     * paid, recurring bill and the user said yes. `$receipt` is the uploaded
     * document; it is kept on the series and on the tick.
     *
     * @param  array{title: string, amount?: float|string|null, currency?: string|null, counterparty?: string|null, notes?: string|null, repeat?: string, repeat_every?: int, repeat_until?: string|null, visibility?: string}  $bill
     * @return array{entry: CalendarEvent, paid: CalendarEventCompletion, next_due: CarbonImmutable|null}
     */
    public function recordPaidBill(User $by, ?int $storeId, CarbonImmutable $paidOn, array $bill, ?Model $receipt = null): array
    {
        return DB::transaction(function () use ($by, $storeId, $paidOn, $bill, $receipt): array {
            $entry = $this->create($by, $storeId, [
                'title' => $bill['title'],
                'kind' => CalendarEvent::KIND_BILL,
                'visibility' => $bill['visibility'] ?? CalendarEvent::VISIBILITY_SHARED,
                'starts_at' => $paidOn->startOfDay(),
                'all_day' => true,
                'repeat' => $bill['repeat'] ?? CalendarEvent::REPEAT_MONTHLY,
                'repeat_every' => $bill['repeat_every'] ?? 1,
                'repeat_until' => $bill['repeat_until'] ?? null,
                'amount' => $bill['amount'] ?? null,
                'currency' => $bill['currency'] ?? 'ETB',
                'counterparty' => $bill['counterparty'] ?? null,
                'notes' => $bill['notes'] ?? null,
            ], $receipt);

            $paid = $this->complete($entry, $paidOn->startOfDay(), $by, $bill['amount'] ?? null, null, $receipt);

            return [
                'entry' => $entry,
                'paid' => $paid,
                'next_due' => $this->recurrence->nextOnOrAfter($entry, $paidOn->addDay()),
            ];
        });
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    private function normalise(array $data): array
    {
        $allDay = (bool) ($data['all_day'] ?? true);
        $start = CarbonImmutable::parse((string) $data['starts_at']);
        $end = isset($data['ends_at']) && $data['ends_at'] !== null && $data['ends_at'] !== '' ? CarbonImmutable::parse((string) $data['ends_at']) : null;

        if ($allDay) {
            $start = $start->startOfDay();
            $end = $end !== null && $end->gt($start->endOfDay()) ? $end->endOfDay() : null;
        } elseif ($end !== null && $end->lte($start)) {
            $end = null;
        }

        $repeat = (string) ($data['repeat'] ?? CalendarEvent::REPEAT_NONE);
        $kind = (string) ($data['kind'] ?? CalendarEvent::KIND_REMINDER);
        $amount = $data['amount'] ?? null;

        return [
            'title' => trim((string) $data['title']),
            'notes' => $data['notes'] ?? null,
            'kind' => $kind,
            'visibility' => (string) ($data['visibility'] ?? CalendarEvent::VISIBILITY_SHARED),
            'starts_at' => $start,
            'ends_at' => $end,
            'all_day' => $allDay,
            'repeat' => $repeat,
            'repeat_every' => $repeat === CalendarEvent::REPEAT_NONE ? 1 : max(1, (int) ($data['repeat_every'] ?? 1)),
            'repeat_until' => $repeat === CalendarEvent::REPEAT_NONE ? null : ($data['repeat_until'] ?? null),
            'amount' => $amount === null || $amount === '' ? null : $amount,
            'currency' => $amount === null || $amount === '' ? null : strtoupper((string) ($data['currency'] ?? 'ETB')),
            'counterparty' => ($data['counterparty'] ?? null) ?: null,
        ];
    }
}
