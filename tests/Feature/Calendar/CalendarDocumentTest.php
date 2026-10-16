<?php

declare(strict_types=1);

namespace Tests\Feature\Calendar;

use App\Models\Auth\User;
use App\Models\Calendar\CalendarEvent;
use App\Models\Document\Document;
use App\Models\Store\Store;
use App\Services\Documents\ReceiptReader;
use App\Services\Documents\ReceiptReaderException;
use App\Services\Documents\ReceiptReading;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Storage;
use PHPUnit\Framework\Attributes\Test;
use Spatie\Permission\Models\Role;
use Tests\TestCase;

/**
 * A receipt uploaded on the calendar: kept privately, read (here by a fake
 * reader, never the real API), checked by the person, and put on the calendar
 * as paid today and due again next month.
 */
class CalendarDocumentTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        foreach (['admin', 'seller'] as $role) {
            Role::firstOrCreate(['name' => $role]);
        }

        Date::setTestNow(CarbonImmutable::parse('2026-10-16 10:00'));
        Storage::fake('local');
        config(['services.documents.disk' => 'local']);
        $this->store = Store::factory()->create(['name' => 'Main Store']);
    }

    protected function tearDown(): void
    {
        Date::setTestNow();
        parent::tearDown();
    }

    #[Test]
    public function without_a_reader_the_upload_is_kept_and_the_page_asks_the_person_to_fill_it_in(): void
    {
        $this->reader(null);
        $seller = $this->seller();

        $response = $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.documents.store'), ['file' => UploadedFile::fake()->image('receipt.jpg')]);

        $document = Document::query()->sole();
        $response->assertRedirect(route('seller.calendar', ['document' => $document->id]));
        $this->assertSame(Document::STATUS_UNREAD, $document->status);
        $this->assertSame($this->store->id, $document->store_id);
        Storage::disk('local')->assertExists($document->path);

        $this->asRole($seller, 'seller')
            ->get(route('seller.calendar', ['document' => $document->id]))
            ->assertInertia(fn ($page) => $page
                ->where('readerEnabled', false)
                ->where('pendingDocument.id', $document->id)
                ->where('pendingDocument.status', 'unread')
                ->where('pendingDocument.is_image', true));
    }

    #[Test]
    public function a_paid_monthly_receipt_goes_on_as_paid_today_and_due_next_month(): void
    {
        $this->reader(ReceiptReading::fromArray([
            'kind' => 'receipt', 'is_paid' => true, 'date' => '2026-10-16', 'date_as_printed' => '06/02/2019',
            'amount' => 1500, 'currency' => 'ETB', 'payee' => 'Ethio Telecom', 'title' => 'Internet',
            'recurring' => true, 'repeat' => 'monthly', 'repeat_every' => 1, 'summary' => 'A paid internet bill.',
        ]));
        $seller = $this->seller();

        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.documents.store'), ['file' => UploadedFile::fake()->create('receipt.pdf', 120, 'application/pdf')]);
        $document = Document::query()->sole();
        $this->assertSame(Document::STATUS_READ, $document->status);
        $this->assertSame('Ethio Telecom', $document->reading['payee']);

        // The person keeps the suggestion as it is.
        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.documents.add', $document), [
                'title' => 'Internet', 'paid' => true, 'date' => '2026-10-16', 'amount' => 1500, 'currency' => 'ETB',
                'counterparty' => 'Ethio Telecom', 'repeat' => 'monthly', 'repeat_every' => 1, 'visibility' => 'shared',
            ])
            ->assertRedirect(route('seller.calendar', ['date' => '2026-10-16']))
            ->assertSessionHas('success');

        $entry = CalendarEvent::query()->sole();
        $this->assertSame($document->getMorphClass(), $entry->source_type);
        $this->assertSame($document->id, (int) $entry->source_id);
        $this->assertSame(Document::STATUS_ADDED, $document->refresh()->status);
        $this->assertSame($entry->id, $document->calendar_event_id);
        $this->assertSame($document->id, (int) $entry->completions()->sole()->source_id);

        $events = $this->asRole($seller, 'seller')
            ->getJson(route('seller.calendar.feed', ['from' => '2026-10-01', 'to' => '2026-11-30', 'sources' => ['entries']]))
            ->assertOk()
            ->json('events');
        $this->assertSame(['2026-10-16', '2026-11-16'], array_column($events, 'start'));
        $this->assertSame(['done', 'upcoming'], array_column($events, 'state'));
        $this->assertSame(route('seller.calendar.documents.show', $document->id), $events[0]['entry']['document_url']);

        // Added once only.
        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.documents.add', $document), [
                'title' => 'Internet', 'paid' => true, 'date' => '2026-10-16', 'repeat' => 'monthly', 'visibility' => 'shared',
            ])
            ->assertSessionHas('error');
        $this->assertSame(1, CalendarEvent::query()->count());
    }

    #[Test]
    public function a_bill_still_to_pay_goes_on_as_due_on_its_day(): void
    {
        $this->reader(null);
        $seller = $this->seller();
        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.documents.store'), ['file' => UploadedFile::fake()->image('bill.png')]);

        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.documents.add', Document::query()->sole()), [
                'title' => 'Shop rent', 'paid' => false, 'date' => '2026-10-30', 'amount' => 20000,
                'repeat' => 'none', 'visibility' => 'private',
            ])
            ->assertSessionHas('success');

        $entry = CalendarEvent::query()->sole();
        $this->assertSame('2026-10-30', $entry->starts_at->toDateString());
        $this->assertSame(CalendarEvent::KIND_BILL, $entry->kind);
        $this->assertSame(0, $entry->completions()->count());
    }

    #[Test]
    public function a_reader_failure_is_kept_and_shown(): void
    {
        $this->app->instance(ReceiptReader::class, new class implements ReceiptReader {
            public function enabled(): bool
            {
                return true;
            }

            public function read(string $contents, string $mimeType, string $today): ReceiptReading
            {
                throw new ReceiptReaderException('This file could not be read. Try a clearer photo or a PDF.');
            }
        });
        $seller = $this->seller();

        $this->asRole($seller, 'seller')
            ->post(route('seller.calendar.documents.store'), ['file' => UploadedFile::fake()->image('blurry.jpg')]);

        $document = Document::query()->sole();
        $this->assertSame(Document::STATUS_FAILED, $document->status);
        $this->assertSame('This file could not be read. Try a clearer photo or a PDF.', $document->read_error);
    }

    #[Test]
    public function only_photos_and_pdfs_are_taken(): void
    {
        $this->reader(null);

        $this->asRole($this->seller(), 'seller')
            ->post(route('seller.calendar.documents.store'), ['file' => UploadedFile::fake()->create('notes.txt', 2, 'text/plain')])
            ->assertSessionHasErrors('file');

        $this->assertSame(0, Document::query()->count());
    }

    #[Test]
    public function a_document_stays_with_its_uploader_until_it_is_on_a_shared_entry(): void
    {
        $this->reader(null);
        $author = $this->seller();
        $colleague = $this->seller();
        $this->asRole($author, 'seller')
            ->post(route('seller.calendar.documents.store'), ['file' => UploadedFile::fake()->image('receipt.jpg')]);
        $document = Document::query()->sole();

        $this->asRole($colleague, 'seller')->get(route('seller.calendar.documents.show', $document))->assertNotFound();
        $this->asRole($colleague, 'seller')
            ->post(route('seller.calendar.documents.add', $document), [
                'title' => 'Mine', 'paid' => true, 'date' => '2026-10-16', 'repeat' => 'none', 'visibility' => 'shared',
            ])
            ->assertNotFound();
        $this->asRole($author, 'seller')->get(route('seller.calendar.documents.show', $document))->assertOk();

        $this->asRole($author, 'seller')
            ->post(route('seller.calendar.documents.add', $document), [
                'title' => 'Water', 'paid' => true, 'date' => '2026-10-16', 'repeat' => 'none', 'visibility' => 'shared',
            ]);

        $this->asRole($colleague, 'seller')->get(route('seller.calendar.documents.show', $document))->assertOk();
    }

    #[Test]
    public function a_reading_is_cleaned_before_it_is_kept(): void
    {
        $reading = ReceiptReading::fromArray([
            'kind' => 'invoice?', 'is_paid' => true, 'date' => '16/10/2026', 'amount' => -5, 'currency' => 'birr',
            'payee' => '  ', 'title' => '', 'recurring' => true, 'repeat' => 'none', 'repeat_every' => 40, 'summary' => null,
        ]);

        $this->assertSame('other', $reading->kind);
        $this->assertNull($reading->date);
        $this->assertNull($reading->amount);
        $this->assertNull($reading->currency);
        $this->assertNull($reading->payee);
        $this->assertSame('Bill', $reading->title);
        $this->assertFalse($reading->recurring);
        $this->assertSame(12, $reading->repeatEvery);
    }

    /* ---------------------------------------------------------------------
     | Helpers
     |--------------------------------------------------------------------*/

    /** A fake reader: off when $reading is null, otherwise always answering $reading. */
    private function reader(?ReceiptReading $reading): void
    {
        $this->app->instance(ReceiptReader::class, new class($reading) implements ReceiptReader {
            public function __construct(private readonly ?ReceiptReading $reading)
            {
            }

            public function enabled(): bool
            {
                return $this->reading !== null;
            }

            public function read(string $contents, string $mimeType, string $today): ReceiptReading
            {
                return $this->reading ?? throw new ReceiptReaderException('off');
            }
        });
    }

    private function seller(): User
    {
        $user = User::factory()->create(['role' => 'seller', 'store_id' => $this->store->id]);
        $user->assignRole('seller');

        return $user;
    }

    private function asRole(User $user, string $subdomain): self
    {
        $this->withServerVariables(['HTTP_HOST' => "{$subdomain}.localhost"]);
        $this->actingAs($user, 'web');

        return $this;
    }
}
