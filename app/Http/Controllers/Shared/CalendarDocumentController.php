<?php

declare(strict_types=1);

namespace App\Http\Controllers\Shared;

use App\Http\Controllers\Controller;
use App\Http\Requests\Document\AddDocumentToCalendarRequest;
use App\Http\Requests\Document\UploadDocumentRequest;
use App\Models\Calendar\CalendarEvent;
use App\Models\Document\Document;
use App\Services\Admin\ActiveStore;
use App\Services\Calendar\CalendarScope;
use App\Services\Documents\DocumentService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Receipts and bills uploaded on the calendar page: upload (the reader
 * suggests what it is), view the file, and add it to the calendar once the
 * person has checked the suggestion. The page shows the suggestion when it is
 * opened with `?document=<id>` (CalendarController::index).
 */
class CalendarDocumentController extends Controller
{
    public function store(UploadDocumentRequest $request, DocumentService $documents): RedirectResponse
    {
        $scope = $this->scope($request);
        $document = $documents->upload($request->file('file'), $request->user(), $scope->storeForNewEntry($this->activeStore($request)));

        return redirect()->route("{$scope->app}.calendar", ['document' => $document->id]);
    }

    /** The file itself, to whoever uploaded it or can see the entry it became. */
    public function show(Request $request, Document $document, DocumentService $documents): Response
    {
        abort_unless($this->canView($request, $document), 404);

        return response($documents->contents($document), 200, [
            'Content-Type' => $document->mime_type,
            'Content-Disposition' => 'inline; filename="'.addcslashes($document->original_name, '"\\').'"',
            'Cache-Control' => 'private, max-age=600',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    public function add(AddDocumentToCalendarRequest $request, Document $document, DocumentService $documents): RedirectResponse
    {
        $scope = $this->scope($request);
        abort_unless((int) $document->uploaded_by === (int) $request->user()->id, 404);

        if ($document->calendar_event_id !== null) {
            return redirect()->route("{$scope->app}.calendar", ['date' => $request->input('date')])
                ->with('error', 'This document is already on the calendar.');
        }

        $entry = $documents->addToCalendar($document, $request->user(), $scope->storeForNewEntry($this->activeStore($request)), $request->validated());

        $message = $request->boolean('paid')
            ? "\"{$entry->title}\" is on the calendar as paid".($entry->repeats() ? ', with the next one due.' : '.')
            : "\"{$entry->title}\" is on the calendar, due {$entry->starts_at->format('j M')}.";

        return redirect()->route("{$scope->app}.calendar", ['date' => $entry->starts_at->toDateString()])->with('success', $message);
    }

    private function canView(Request $request, Document $document): bool
    {
        if ((int) $document->uploaded_by === (int) $request->user()->id) {
            return true;
        }

        $scope = $this->scope($request);

        return CalendarEvent::query()
            ->where('source_type', $document->getMorphClass())
            ->where('source_id', $document->id)
            ->visibleTo($scope->viewer, $scope->entryStoreIds)
            ->exists();
    }

    private function scope(Request $request): CalendarScope
    {
        $app = explode('.', (string) $request->route()?->getName())[0];
        abort_unless(in_array($app, CalendarScope::APPS, true), 404);

        return CalendarScope::for($app, $request->user(), $this->activeStore($request));
    }

    private function activeStore(Request $request): ?ActiveStore
    {
        return str_starts_with((string) $request->route()?->getName(), 'admin.') ? app(ActiveStore::class) : null;
    }
}
