<?php

declare(strict_types=1);

namespace App\Services\Documents;

use App\Models\Auth\User;
use App\Models\Calendar\CalendarEvent;
use App\Models\Document\Document;
use App\Services\Calendar\CalendarEventService;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * An uploaded receipt or bill, from the file to the calendar:
 *
 *   upload()        keep the file (privately) and let the reader suggest what it is
 *   addToCalendar() the person checked the suggestion: a paid receipt becomes a
 *                   bill ticked paid on its day (and due again if it repeats);
 *                   a bill to pay becomes one due on its day
 */
class DocumentService
{
    public function __construct(
        private readonly ReceiptReader $reader,
        private readonly CalendarEventService $calendar,
    ) {
    }

    public function readerEnabled(): bool
    {
        return $this->reader->enabled();
    }

    public function upload(UploadedFile $file, User $by, ?int $storeId): Document
    {
        $disk = (string) config('services.documents.disk', 'local');
        $extension = strtolower($file->getClientOriginalExtension() ?: ($file->extension() ?? 'bin'));
        $path = $file->storeAs('documents/'.now()->format('Y/m'), Str::uuid()->toString().'.'.$extension, ['disk' => $disk, 'visibility' => 'private']);

        $document = Document::query()->create([
            'store_id' => $storeId,
            'uploaded_by' => $by->id,
            'disk' => $disk,
            'path' => (string) $path,
            'original_name' => mb_substr($file->getClientOriginalName(), 0, 255),
            'mime_type' => (string) $file->getMimeType(),
            'size' => (int) $file->getSize(),
            'status' => Document::STATUS_UNREAD,
        ]);

        return $this->read($document);
    }

    /** Ask the reader (again); without one the document stays unread. */
    public function read(Document $document): Document
    {
        if (! $this->reader->enabled()) {
            return $document;
        }

        try {
            $reading = $this->reader->read($this->contents($document), $document->mime_type, \App\Services\Workforce\LocalTime::dateOf());
            $document->update(['status' => Document::STATUS_READ, 'reading' => $reading->toArray(), 'read_error' => null]);
        } catch (ReceiptReaderException $e) {
            $document->update(['status' => Document::STATUS_FAILED, 'read_error' => mb_substr($e->getMessage(), 0, 255)]);
        }

        return $document->refresh();
    }

    public function contents(Document $document): string
    {
        return (string) Storage::disk($document->disk)->get($document->path);
    }

    /**
     * @param  array{title: string, kind: string, paid: bool, date: string, amount?: float|string|null, currency?: string|null, counterparty?: string|null, notes?: string|null, repeat: string, repeat_every?: int|null, visibility: string}  $data
     */
    public function addToCalendar(Document $document, User $by, ?int $storeId, array $data): CalendarEvent
    {
        return DB::transaction(function () use ($document, $by, $storeId, $data): CalendarEvent {
            $day = CarbonImmutable::parse($data['date'])->startOfDay();
            $bill = [
                'title' => $data['title'],
                'amount' => $data['amount'] ?? null,
                'currency' => $data['currency'] ?? 'ETB',
                'counterparty' => $data['counterparty'] ?? null,
                'notes' => $data['notes'] ?? null,
                'repeat' => $data['repeat'],
                'repeat_every' => (int) ($data['repeat_every'] ?? 1),
                'visibility' => $data['visibility'],
            ];

            $entry = $data['paid']
                ? $this->calendar->recordPaidBill($by, $storeId, $day, $bill, $document)['entry']
                : $this->calendar->create($by, $storeId, $bill + [
                    'kind' => CalendarEvent::KIND_BILL,
                    'starts_at' => $day->toDateString(),
                    'all_day' => true,
                ], $document);

            $document->update(['status' => Document::STATUS_ADDED, 'calendar_event_id' => $entry->id]);

            return $entry;
        });
    }
}
