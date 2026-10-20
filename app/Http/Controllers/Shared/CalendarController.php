<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Http\Requests\Calendar\CalendarFeedRequest;
use App\Http\Requests\Calendar\CompleteCalendarEventRequest;
use App\Http\Requests\Calendar\SaveCalendarEventRequest;
use App\Models\Calendar\CalendarEvent;
use App\Models\Document\Document;
use App\Services\Admin\ActiveStore;
use App\Services\Calendar\CalendarEventService;
use App\Services\Calendar\CalendarFeed;
use App\Services\Calendar\CalendarScope;
use App\Services\Calendar\CalendarStarters;
use App\Services\Calendar\Sources\EntrySource;
use App\Services\Documents\DocumentService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use InvalidArgumentException;
use Inertia\Inertia;
use Inertia\Response;

/**
 * The calendar: one page on admin, seller, stock keeper, delivery and
 * procurement (routes/web/partials/calendar.php, under each app's own role
 * gate). The page fetches the events of the range on screen from `feed`
 * (CalendarFeed); entries people add are written through CalendarEventService.
 *
 * The app is read off the route name's prefix (`seller.calendar` → seller).
 */
class CalendarController extends Controller
{
    public function index(Request $request, CalendarFeed $feed, DocumentService $documents, CalendarStarters $starters): Response
    {
        $app = $this->app($request);
        $day = $request->query('date');

        return Inertia::render('Calendar/Index', [
            'app' => $app,
            'sources' => $feed->legend($app),
            // What the viewer may start from a day, besides a note.
            'starters' => $starters->for($this->scope($request)),
            'initialDate' => is_string($day) && strtotime($day) !== false ? CarbonImmutable::parse($day)->toDateString() : null,
            'scopeLabel' => $this->scopeLabel($request, $app),
            'readerEnabled' => $documents->readerEnabled(),
            'pendingDocument' => $this->pendingDocument($request, $app),
        ]);
    }

    /**
     * The document just uploaded (`?document=`), with what the reader made of
     * it, for the person to check before it goes on the calendar.
     *
     * @return array<string, mixed>|null
     */
    private function pendingDocument(Request $request, string $app): ?array
    {
        $id = $request->query('document');
        if (! is_numeric($id)) {
            return null;
        }

        $document = Document::query()
            ->whereKey((int) $id)
            ->where('uploaded_by', $request->user()->id)
            ->whereNull('calendar_event_id')
            ->first();

        return $document === null ? null : [
            'id' => (int) $document->id,
            'name' => $document->original_name,
            'is_image' => $document->isImage(),
            'url' => route("{$app}.calendar.documents.show", $document->id),
            'status' => $document->status,
            'reading' => $document->reading,
            'read_error' => $document->read_error,
        ];
    }

    public function feed(CalendarFeedRequest $request, CalendarFeed $feed): JsonResponse
    {
        return response()->json([
            'events' => $feed->between($this->scope($request), $request->from(), $request->to(), $request->sources()),
        ]);
    }

    public function store(SaveCalendarEventRequest $request, CalendarEventService $service): RedirectResponse
    {
        $scope = $this->scope($request);
        $data = $request->validated();
        $storeId = $scope->storeForNewEntry($this->activeStore($request));

        if ((bool) ($data['paid_now'] ?? false) && $data['kind'] === CalendarEvent::KIND_BILL) {
            $entry = $service->create($request->user(), $storeId, $data);
            $service->complete($entry, $entry->starts_at->startOfDay(), $request->user());

            return back()->with('success', "\"{$entry->title}\" marked paid".($entry->repeats() ? ', next one is on the calendar.' : '.'));
        }

        $entry = $service->create($request->user(), $storeId, $data);

        return back()->with('success', "\"{$entry->title}\" added to the calendar.");
    }

    public function update(SaveCalendarEventRequest $request, CalendarEvent $entry, CalendarEventService $service, EntrySource $entries): RedirectResponse
    {
        abort_unless($entries->canEdit($this->scope($request), $entry), 403);

        $service->update($entry, $request->validated());

        return back()->with('success', "\"{$entry->title}\" saved.");
    }

    public function destroy(Request $request, CalendarEvent $entry, CalendarEventService $service, EntrySource $entries): RedirectResponse
    {
        abort_unless($entries->canEdit($this->scope($request), $entry), 403);

        $service->delete($entry);

        return back()->with('success', "\"{$entry->title}\" removed from the calendar.");
    }

    public function complete(CompleteCalendarEventRequest $request, CalendarEvent $entry, CalendarEventService $service): RedirectResponse
    {
        $scope = $this->scope($request);
        // Anyone who can see the entry may tick it: the tick records who did.
        abort_unless(CalendarEvent::query()->whereKey($entry->id)->visibleTo($scope->viewer, $scope->entryStoreIds)->exists(), 404);

        if (! $request->boolean('done')) {
            $service->reopen($entry, $request->day());

            return back()->with('success', "\"{$entry->title}\" reopened.");
        }

        try {
            $service->complete($entry, $request->day(), $request->user(), $request->input('amount'), $request->input('note'));
        } catch (InvalidArgumentException $e) {
            return back()->with('error', $e->getMessage());
        }

        return back()->with('success', $entry->kind === CalendarEvent::KIND_BILL ? "\"{$entry->title}\" marked paid." : "\"{$entry->title}\" marked done.");
    }

    private function app(Request $request): string
    {
        $app = explode('.', (string) $request->route()?->getName())[0];
        abort_unless(in_array($app, CalendarScope::APPS, true), 404);

        return $app;
    }

    private function scope(Request $request): CalendarScope
    {
        return CalendarScope::for($this->app($request), $request->user(), $this->activeStore($request));
    }

    private function activeStore(Request $request): ?ActiveStore
    {
        return $this->app($request) === 'admin' ? app(ActiveStore::class) : null;
    }

    private function scopeLabel(Request $request, string $app): string
    {
        $scope = $this->scope($request);

        if ($scope->courierId !== null) {
            return 'Your runs';
        }

        if ($app === 'admin') {
            return (string) (app(ActiveStore::class)->toShared()['activeStore']['name'] ?? 'All stores');
        }

        return $request->user()->store?->name ?? 'All stores';
    }
}
